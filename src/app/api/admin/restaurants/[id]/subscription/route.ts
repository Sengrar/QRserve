import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { AdminUpdateCustomPricingSchema } from "@/lib/validations/subscription";
import { prisma } from "@/lib/db/prisma";
import { evaluateSubscriptionStatus } from "@/lib/subscription/status";
import { SubscriptionPlan } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    await requireSuperAdmin();
    const { id: restaurantId } = await context.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: {
        subscription: true,
        paymentRequests: {
          orderBy: { createdAt: "desc" },
          take: 10,
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: "Restaurant not found." },
        { status: 404 }
      );
    }

    const evaluated = evaluateSubscriptionStatus(restaurant.subscription);

    return NextResponse.json({
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
          approvalStatus: restaurant.approvalStatus,
          isActive: restaurant.isActive,
          isSuspended: restaurant.isSuspended,
        },
        subscription: restaurant.subscription,
        evaluated,
        paymentRequests: restaurant.paymentRequests,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("GET /api/admin/restaurants/[id]/subscription error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const adminUser = await requireSuperAdmin();
    const { id: restaurantId } = await context.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: "Restaurant not found." },
        { status: 404 }
      );
    }

    const json = await request.json();
    const validation = AdminUpdateCustomPricingSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const {
      monthlyPrice,
      yearlyPrice,
      billingPeriod,
      nextBillingDate,
      paymentStatus,
      subscriptionStatus,
      currency,
      tableLimit,
      notes,
    } = validation.data;

    const assignedAmount = billingPeriod === "YEARLY" ? yearlyPrice : monthlyPrice;
    const amountPaise = Math.round(assignedAmount * 100);
    const parsedNextBilling = nextBillingDate ? new Date(nextBillingDate) : null;

    const auditEntry = `[${new Date().toISOString()} by ${adminUser.name}]: Custom pricing updated: Monthly ₹${monthlyPrice}, Yearly ₹${yearlyPrice}, Period ${billingPeriod}, Payment ${paymentStatus}, Status ${subscriptionStatus}`;
    const combinedNotes = notes
      ? `${notes}\n${auditEntry}`
      : restaurant.subscription?.notes
      ? `${restaurant.subscription.notes}\n${auditEntry}`
      : auditEntry;

    const existingEndDate = restaurant.subscription?.endDate;
    const resolvedEndDate =
      parsedNextBilling ||
      existingEndDate ||
      new Date(Date.now() + (billingPeriod === "YEARLY" ? 365 : 30) * 24 * 60 * 60 * 1000);

    const subscription = await prisma.subscription.upsert({
      where: { restaurantId },
      create: {
        restaurantId,
        plan: SubscriptionPlan.SMALL,
        status: subscriptionStatus,
        billingPeriod,
        currency: currency || "INR",
        customMonthlyPrice: monthlyPrice,
        customYearlyPrice: yearlyPrice,
        nextBillingDate: parsedNextBilling,
        paymentStatus,
        tableLimit: tableLimit || 10,
        amount: assignedAmount,
        amountPaise,
        startDate: new Date(),
        endDate: resolvedEndDate,
        notes: combinedNotes,
      },
      update: {
        status: subscriptionStatus,
        billingPeriod,
        currency: currency || "INR",
        customMonthlyPrice: monthlyPrice,
        customYearlyPrice: yearlyPrice,
        nextBillingDate: parsedNextBilling,
        paymentStatus,
        tableLimit: tableLimit !== undefined ? tableLimit : undefined,
        amount: assignedAmount,
        amountPaise,
        endDate: resolvedEndDate,
        notes: combinedNotes,
      },
    });

    return NextResponse.json({
      success: true,
      message: `Custom subscription pricing successfully saved for ${restaurant.name}.`,
      data: subscription,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("PATCH /api/admin/restaurants/[id]/subscription error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
