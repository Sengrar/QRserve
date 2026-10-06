import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { ReviewPaymentRequestSchema } from "@/lib/validations/subscription";
import { calculateSubscriptionCycleDates } from "@/lib/subscription/status";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus, PaymentRequestStatus, SubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const adminUser = await requireSuperAdmin();
    const { id: paymentRequestId } = await context.params;

    const json = await request.json();
    const validation = ReviewPaymentRequestSchema.safeParse(json);

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

    const { status: decisionStatus, adminNotes } = validation.data;

    // Execute review inside an isolated transaction to prevent race conditions and duplicate approvals.
    const result = await prisma.$transaction(async (tx) => {
      const paymentRequest = await tx.subscriptionPaymentRequest.findUnique({
        where: { id: paymentRequestId },
        include: {
          restaurant: {
            include: { subscription: true },
          },
        },
      });

      if (!paymentRequest) {
        throw new Error("NOT_FOUND");
      }

      // Race condition / duplicate approval guard:
      // Status must strictly be PENDING
      if (paymentRequest.status !== PaymentRequestStatus.PENDING) {
        throw new Error("ALREADY_REVIEWED");
      }

      // Restaurant approval gate:
      // A restaurant must be APPROVED by Super Admin before a subscription can be activated.
      if (
        decisionStatus === PaymentRequestStatus.APPROVED &&
        paymentRequest.restaurant.approvalStatus !== ApprovalStatus.APPROVED
      ) {
        throw new Error("RESTAURANT_NOT_APPROVED");
      }

      if (decisionStatus === PaymentRequestStatus.APPROVED) {
        // Calculate subscription cycle (30 days for MONTHLY, 365 days for YEARLY)
        const cycle = calculateSubscriptionCycleDates(
          paymentRequest.restaurant.subscription,
          paymentRequest.billingPeriod
        );

        // Upsert or update the active subscription
        const subscription = await tx.subscription.upsert({
          where: { restaurantId: paymentRequest.restaurantId },
          create: {
            restaurantId: paymentRequest.restaurantId,
            plan: paymentRequest.plan,
            billingPeriod: paymentRequest.billingPeriod,
            tableLimit: paymentRequest.tableCount,
            amount: paymentRequest.amount,
            amountPaise: paymentRequest.amountPaise,
            status: SubscriptionStatus.ACTIVE,
            paymentStatus: "PAID",
            nextBillingDate: cycle.endDate,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            lastPaymentRequestId: paymentRequest.id,
            notes: adminNotes || `Approved by Super Admin ${adminUser.name}`,
          },
          update: {
            plan: paymentRequest.plan,
            billingPeriod: paymentRequest.billingPeriod,
            tableLimit: paymentRequest.tableCount,
            amount: paymentRequest.amount,
            amountPaise: paymentRequest.amountPaise,
            status: SubscriptionStatus.ACTIVE,
            paymentStatus: "PAID",
            nextBillingDate: cycle.endDate,
            startDate: cycle.startDate,
            endDate: cycle.endDate,
            lastPaymentRequestId: paymentRequest.id,
            notes: adminNotes || `Renewed/Approved by Super Admin ${adminUser.name}`,
          },
        });

        // Mark payment request as APPROVED with audit details
        const updatedRequest = await tx.subscriptionPaymentRequest.update({
          where: { id: paymentRequestId },
          data: {
            status: PaymentRequestStatus.APPROVED,
            subscriptionId: subscription.id,
            reviewedById: adminUser.id,
            reviewedAt: new Date(),
            adminNotes: adminNotes || null,
          },
        });

        return {
          paymentRequest: updatedRequest,
          subscription,
        };
      } else {
        // Decision is REJECTED
        const updatedRequest = await tx.subscriptionPaymentRequest.update({
          where: { id: paymentRequestId },
          data: {
            status: PaymentRequestStatus.REJECTED,
            reviewedById: adminUser.id,
            reviewedAt: new Date(),
            adminNotes: adminNotes || "Payment details could not be verified.",
          },
        });

        return {
          paymentRequest: updatedRequest,
          subscription: paymentRequest.restaurant.subscription,
        };
      }
    });

    return NextResponse.json({
      success: true,
      message: `Payment request ${decisionStatus.toLowerCase()} successfully.`,
      data: result,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }

    if (error instanceof Error) {
      if (error.message === "NOT_FOUND") {
        return NextResponse.json({ success: false, error: "Payment request not found." }, { status: 404 });
      }
      if (error.message === "ALREADY_REVIEWED") {
        return NextResponse.json(
          {
            success: false,
            error: "This payment request has already been reviewed. Duplicate modifications are prevented.",
          },
          { status: 409 }
        );
      }
      if (error.message === "RESTAURANT_NOT_APPROVED") {
        return NextResponse.json(
          {
            success: false,
            error:
              "Cannot activate subscription: The restaurant is still pending approval. Please approve the restaurant first.",
          },
          { status: 400 }
        );
      }
    }

    console.error("PATCH /api/admin/subscriptions/payment-requests/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
