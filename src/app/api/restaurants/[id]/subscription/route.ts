import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { evaluateSubscriptionStatus } from "@/lib/subscription/status";
import { getTableUsageMetrics } from "@/lib/subscription/limits";
import {
  SMALL_PLAN_PRICE_RUPEES,
  SMALL_PLAN_MAX_TABLES,
  MEDIUM_PLAN_PRICE_RUPEES,
  MEDIUM_PLAN_MAX_TABLES,
  LARGE_PLAN_PRICE_PER_TABLE_RUPEES,
} from "@/lib/subscription/pricing";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const [restaurant, paymentRequests, paymentConfig, tableUsage] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        include: {
          subscription: true,
        },
      }),
      prisma.subscriptionPaymentRequest.findMany({
        where: { restaurantId },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true,
          plan: true,
          tableCount: true,
          amount: true,
          amountPaise: true,
          paymentMethod: true,
          utrReference: true,
          status: true,
          adminNotes: true,
          reviewedAt: true,
          createdAt: true,
        },
      }),
      prisma.systemPaymentConfig.findFirst({
        orderBy: { createdAt: "desc" },
      }),
      getTableUsageMetrics(restaurantId),
    ]);

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const evaluatedSubscription = evaluateSubscriptionStatus(restaurant.subscription);

    const defaultPaymentConfig = paymentConfig || {
      upiId: "qrserve@upi",
      payeeName: "QRServe Platform",
      bankName: "HDFC Bank",
      accountNumber: "50200012345678",
      ifscCode: "HDFC0001234",
      accountType: "Current Account",
      instructions:
        "Please mention your Restaurant Slug/Name in the remarks. Submit the 12-digit UTR/Reference after paying.",
    };

    return NextResponse.json({
      success: true,
      data: {
        subscription: restaurant.subscription,
        evaluated: evaluatedSubscription,
        assignedPricing: {
          monthlyPrice: evaluatedSubscription.customMonthlyPrice,
          yearlyPrice: evaluatedSubscription.customYearlyPrice,
          billingPeriod: evaluatedSubscription.billingPeriod,
          assignedAmount: evaluatedSubscription.assignedAmount,
          currency: evaluatedSubscription.currency,
          paymentStatus: evaluatedSubscription.paymentStatus,
          nextBillingDate: evaluatedSubscription.nextBillingDate,
        },
        paymentRequests,
        paymentConfig: defaultPaymentConfig,
        tableUsage,
        pricingCatalog: {
          small: {
            name: "Small Restaurant",
            priceRupees: SMALL_PLAN_PRICE_RUPEES,
            pricePaise: SMALL_PLAN_PRICE_RUPEES * 100,
            tableLimit: SMALL_PLAN_MAX_TABLES,
            description: `Up to ${SMALL_PLAN_MAX_TABLES} tables included. ₹${SMALL_PLAN_PRICE_RUPEES}/month.`,
          },
          medium: {
            name: "Medium Restaurant",
            priceRupees: MEDIUM_PLAN_PRICE_RUPEES,
            pricePaise: MEDIUM_PLAN_PRICE_RUPEES * 100,
            tableLimit: MEDIUM_PLAN_MAX_TABLES,
            description: `Up to ${MEDIUM_PLAN_MAX_TABLES} tables included. ₹${MEDIUM_PLAN_PRICE_RUPEES}/month.`,
          },
          large: {
            name: "Large Restaurant",
            pricePerTableRupees: LARGE_PLAN_PRICE_PER_TABLE_RUPEES,
            pricePerTablePaise: LARGE_PLAN_PRICE_PER_TABLE_RUPEES * 100,
            description: `Custom tables at ₹${LARGE_PLAN_PRICE_PER_TABLE_RUPEES}/table/month.`,
          },
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/subscription error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch subscription details." },
      { status: 500 }
    );
  }
}
