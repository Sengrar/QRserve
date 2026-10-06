import React from "react";
import { notFound, redirect } from "next/navigation";
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
import { RestaurantSubscriptionManager } from "@/components/subscription/RestaurantSubscriptionManager";

export const dynamic = "force-dynamic";

interface SubscriptionPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantSubscriptionPage({
  params,
}: SubscriptionPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
  if (!access.authorized) {
    redirect("/dashboard");
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
    }),
    prisma.systemPaymentConfig.findFirst({
      orderBy: { createdAt: "desc" },
    }),
    getTableUsageMetrics(restaurantId),
  ]);

  if (!restaurant) {
    notFound();
  }

  const evaluated = evaluateSubscriptionStatus(restaurant.subscription);

  const defaultPaymentConfig = paymentConfig
    ? {
        upiId: paymentConfig.upiId,
        payeeName: paymentConfig.payeeName,
        bankName: paymentConfig.bankName,
        accountNumber: paymentConfig.accountNumber,
        ifscCode: paymentConfig.ifscCode,
        accountType: paymentConfig.accountType,
        instructions: paymentConfig.instructions,
      }
    : {
        upiId: "qrserve@upi",
        payeeName: "QRServe Platform",
        bankName: "HDFC Bank",
        accountNumber: "50200012345678",
        ifscCode: "HDFC0001234",
        accountType: "Current Account",
        instructions:
          "Please mention your Restaurant Name or Slug in the remarks. Enter the 12-digit UTR/Transaction Reference number after completing payment.",
      };

  const initialData = {
    subscription: restaurant.subscription
      ? {
          id: restaurant.subscription.id,
          plan: restaurant.subscription.plan,
          status: restaurant.subscription.status,
          billingPeriod: restaurant.subscription.billingPeriod,
          customMonthlyPrice: Number(restaurant.subscription.customMonthlyPrice),
          customYearlyPrice: Number(restaurant.subscription.customYearlyPrice),
          currency: restaurant.subscription.currency,
          paymentStatus: restaurant.subscription.paymentStatus,
          nextBillingDate: restaurant.subscription.nextBillingDate
            ? restaurant.subscription.nextBillingDate.toISOString()
            : null,
          tableLimit: restaurant.subscription.tableLimit,
          amount: Number(restaurant.subscription.amount),
          startDate: restaurant.subscription.startDate.toISOString(),
          endDate: restaurant.subscription.endDate.toISOString(),
          notes: restaurant.subscription.notes,
        }
      : null,
    evaluated: {
      hasSubscription: evaluated.hasSubscription,
      isValid: evaluated.isValid,
      isExpired: evaluated.isExpired,
      isSuspended: evaluated.isSuspended,
      isNearExpiry: evaluated.isNearExpiry,
      daysRemaining: evaluated.daysRemaining,
      tableLimit: evaluated.tableLimit,
      plan: evaluated.plan,
      status: evaluated.status,
      endDate: evaluated.endDate ? evaluated.endDate.toISOString() : null,
      billingPeriod: evaluated.billingPeriod,
      currency: evaluated.currency,
      customMonthlyPrice: evaluated.customMonthlyPrice,
      customYearlyPrice: evaluated.customYearlyPrice,
      assignedAmount: evaluated.assignedAmount,
      paymentStatus: evaluated.paymentStatus,
      nextBillingDate: evaluated.nextBillingDate ? evaluated.nextBillingDate.toISOString() : null,
    },
    assignedPricing: {
      monthlyPrice: evaluated.customMonthlyPrice,
      yearlyPrice: evaluated.customYearlyPrice,
      billingPeriod: evaluated.billingPeriod,
      assignedAmount: evaluated.assignedAmount,
      currency: evaluated.currency,
      paymentStatus: evaluated.paymentStatus,
      nextBillingDate: evaluated.nextBillingDate ? evaluated.nextBillingDate.toISOString() : null,
    },
    paymentRequests: paymentRequests.map((req) => ({
      id: req.id,
      plan: req.plan,
      billingPeriod: req.billingPeriod,
      tableCount: req.tableCount,
      amount: Number(req.amount),
      paymentMethod: req.paymentMethod,
      utrReference: req.utrReference,
      status: req.status,
      adminNotes: req.adminNotes,
      reviewedAt: req.reviewedAt ? req.reviewedAt.toISOString() : null,
      createdAt: req.createdAt.toISOString(),
    })),
    paymentConfig: defaultPaymentConfig,
    tableUsage,
    pricingCatalog: {
      small: {
        name: "Small Restaurant",
        priceRupees: SMALL_PLAN_PRICE_RUPEES,
        tableLimit: SMALL_PLAN_MAX_TABLES,
        description: `Up to ${SMALL_PLAN_MAX_TABLES} tables included. ₹${SMALL_PLAN_PRICE_RUPEES}/month.`,
      },
      medium: {
        name: "Medium Restaurant",
        priceRupees: MEDIUM_PLAN_PRICE_RUPEES,
        tableLimit: MEDIUM_PLAN_MAX_TABLES,
        description: `Up to ${MEDIUM_PLAN_MAX_TABLES} tables included. ₹${MEDIUM_PLAN_PRICE_RUPEES}/month.`,
      },
      large: {
        name: "Large Restaurant",
        pricePerTableRupees: LARGE_PLAN_PRICE_PER_TABLE_RUPEES,
        description: `Custom tables at ₹${LARGE_PLAN_PRICE_PER_TABLE_RUPEES}/table/month.`,
      },
    },
  };

  return (
    <RestaurantSubscriptionManager
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        approvalStatus: restaurant.approvalStatus,
      }}
      initialData={initialData}
    />
  );
}
