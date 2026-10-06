import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { AdminManageSubscriptionSchema } from "@/lib/validations/subscription";
import { prisma } from "@/lib/db/prisma";
import { SubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const adminUser = await requireSuperAdmin();
    const { id: subscriptionId } = await context.params;

    const json = await request.json();

    // Check if this is a custom pricing update or an extend/suspend action
    if ("monthlyPrice" in json || "yearlyPrice" in json || "billingPeriod" in json) {
      const { AdminUpdateCustomPricingSchema } = await import("@/lib/validations/subscription");
      const pricingValidation = AdminUpdateCustomPricingSchema.safeParse(json);
      if (!pricingValidation.success) {
        return NextResponse.json(
          {
            success: false,
            error: "Validation failed",
            details: pricingValidation.error.flatten().fieldErrors,
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
      } = pricingValidation.data;

      const subscription = await prisma.subscription.findUnique({
        where: { id: subscriptionId },
        include: { restaurant: true },
      });

      if (!subscription) {
        return NextResponse.json({ success: false, error: "Subscription not found." }, { status: 404 });
      }

      const assignedAmount = billingPeriod === "YEARLY" ? yearlyPrice : monthlyPrice;
      const amountPaise = Math.round(assignedAmount * 100);
      const parsedNextBilling = nextBillingDate ? new Date(nextBillingDate) : null;

      const auditEntry = `[${new Date().toISOString()} by ${adminUser.name}]: Custom pricing updated: Monthly ₹${monthlyPrice}, Yearly ₹${yearlyPrice}, Period ${billingPeriod}, Payment ${paymentStatus}, Status ${subscriptionStatus}`;
      const combinedNotes = notes
        ? `${notes}\n${auditEntry}`
        : subscription.notes
        ? `${subscription.notes}\n${auditEntry}`
        : auditEntry;

      const resolvedEndDate = parsedNextBilling || subscription.endDate;

      const updated = await prisma.subscription.update({
        where: { id: subscriptionId },
        data: {
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
        message: "Subscription custom pricing updated successfully.",
        data: updated,
      });
    }

    const validation = AdminManageSubscriptionSchema.safeParse(json);

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

    const { action, days, reason } = validation.data;

    const subscription = await prisma.subscription.findUnique({
      where: { id: subscriptionId },
    });

    if (!subscription) {
      return NextResponse.json({ success: false, error: "Subscription not found." }, { status: 404 });
    }

    let updatedData: {
      status?: SubscriptionStatus;
      endDate?: Date;
      notes?: string;
    } = {};

    const auditNote = `[${new Date().toISOString()} by ${adminUser.name}]: Action: ${action}. Reason: ${reason}`;
    const combinedNotes = subscription.notes ? `${subscription.notes}\n${auditNote}` : auditNote;

    if (action === "SUSPEND") {
      updatedData = {
        status: SubscriptionStatus.SUSPENDED,
        notes: combinedNotes,
      };
    } else if (action === "ACTIVATE") {
      const isPast = new Date(subscription.endDate).getTime() <= Date.now();
      const extendDays = days || 30;
      const baseDate = isPast ? new Date() : new Date(subscription.endDate);
      const newEndDate = isPast
        ? new Date(baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000)
        : (days ? new Date(baseDate.getTime() + days * 24 * 60 * 60 * 1000) : subscription.endDate);

      updatedData = {
        status: SubscriptionStatus.ACTIVE,
        endDate: newEndDate,
        notes: combinedNotes,
      };
    } else if (action === "EXTEND") {
      const extendDays = days || 30;
      const baseDate =
        new Date(subscription.endDate).getTime() > Date.now()
          ? new Date(subscription.endDate)
          : new Date();
      const newEndDate = new Date(baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000);

      updatedData = {
        status: SubscriptionStatus.ACTIVE,
        endDate: newEndDate,
        notes: combinedNotes,
      };
    }

    const updated = await prisma.subscription.update({
      where: { id: subscriptionId },
      data: updatedData,
    });

    return NextResponse.json({
      success: true,
      message: `Subscription successfully updated (${action}).`,
      data: updated,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("PATCH /api/admin/subscriptions/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
