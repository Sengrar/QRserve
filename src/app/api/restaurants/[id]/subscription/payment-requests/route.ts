import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { CreatePaymentRequestSchema } from "@/lib/validations/subscription";
import { prisma } from "@/lib/db/prisma";
import { PaymentRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
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

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      include: { subscription: true },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const json = await request.json();
    const validation = CreatePaymentRequestSchema.safeParse(json);

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

    const { plan: submittedPlan, billingPeriod: submittedPeriod, tableCount: submittedTableCount, paymentMethod, utrReference, proofUrl, notes } = validation.data;

    // Strict Server-Side Pricing Calculation:
    // The server retrieves the restaurant's assigned subscription price directly from the database.
    // Client-submitted price values are completely ignored.
    const billingPeriod = submittedPeriod || restaurant.subscription?.billingPeriod || "MONTHLY";
    const assignedPlan = restaurant.subscription?.plan || submittedPlan || "SMALL";
    const assignedTableLimit = restaurant.subscription?.tableLimit || submittedTableCount || 10;

    let amountInRupees: number;
    if (billingPeriod === "YEARLY") {
      amountInRupees = restaurant.subscription?.customYearlyPrice != null
        ? Number(restaurant.subscription.customYearlyPrice)
        : 4990;
    } else {
      amountInRupees = restaurant.subscription?.customMonthlyPrice != null
        ? Number(restaurant.subscription.customMonthlyPrice)
        : 499;
    }

    const amountInPaise = Math.round(amountInRupees * 100);

    // Prevent duplicate submission with same UTR
    const existingUtr = await prisma.subscriptionPaymentRequest.findFirst({
      where: {
        utrReference: utrReference.trim(),
        status: { in: [PaymentRequestStatus.PENDING, PaymentRequestStatus.APPROVED] },
      },
    });

    if (existingUtr) {
      return NextResponse.json(
        {
          success: false,
          error: "A payment request with this UTR/Reference number is already registered.",
        },
        { status: 409 }
      );
    }

    // Check if there is already a PENDING request for this restaurant
    const pendingRequest = await prisma.subscriptionPaymentRequest.findFirst({
      where: {
        restaurantId,
        status: PaymentRequestStatus.PENDING,
      },
    });

    if (pendingRequest) {
      return NextResponse.json(
        {
          success: false,
          error: "You already have a pending payment request awaiting Super Admin review. Please wait for it to be processed.",
        },
        { status: 400 }
      );
    }

    const paymentRequest = await prisma.subscriptionPaymentRequest.create({
      data: {
        restaurantId,
        subscriptionId: restaurant.subscription?.id || null,
        plan: assignedPlan,
        billingPeriod,
        tableCount: assignedTableLimit,
        amount: amountInRupees,
        amountPaise: amountInPaise,
        paymentMethod,
        utrReference: utrReference.trim(),
        proofUrl: proofUrl || null,
        notes: notes || null,
        status: PaymentRequestStatus.PENDING,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Payment request submitted successfully. Super Admin will verify and activate your subscription.",
        data: paymentRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("POST /api/restaurants/[id]/subscription/payment-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit payment request." },
      { status: 500 }
    );
  }
}
