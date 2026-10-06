import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant } from "@/lib/security/tenant";
import { ValidateCustomerCouponSchema } from "@/lib/validations/coupon";
import { validateCouponEligibility } from "@/lib/coupons/calculator";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;

    // 1. Fetch Restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        approvalStatus: true,
        isActive: true,
        isSuspended: true,
        gstEnabled: true,
        taxRate: true,
        taxMode: true,
        subscription: {
          select: {
            status: true,
            endDate: true,
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Restaurant not found." },
        { status: 404 }
      );
    }

    if (!canPubliclyAccessRestaurant(restaurant)) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "This restaurant is currently closed." },
        { status: 403 }
      );
    }

    // 2. Parse & Validate Payload
    const body = await request.json().catch(() => null);
    const parsed = ValidateCustomerCouponSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: issue ? issue.message : "Invalid coupon validation payload.",
        },
        { status: 400 }
      );
    }

    const { code, subtotal, customerPhone } = parsed.data;

    // 3. Query Coupon strictly scoped to this restaurant
    const coupon = await prisma.coupon.findUnique({
      where: {
        restaurantId_code: {
          restaurantId: restaurant.id,
          code: code.toUpperCase().trim(),
        },
      },
    });

    if (!coupon) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_CODE",
          error: `Coupon "${code.toUpperCase()}" is not valid for this restaurant.`,
        },
        { status: 400 }
      );
    }

    // 4. Check Per-Customer Usage if customerPhone is provided
    let customerUsageCount = 0;
    if (coupon.perCustomerLimit && customerPhone) {
      customerUsageCount = await prisma.couponUsage.count({
        where: {
          couponId: coupon.id,
          customerIdentifier: customerPhone.trim(),
        },
      });
    }

    // 5. Evaluate Eligibility
    const evaluation = validateCouponEligibility(coupon, {
      subtotal,
      restaurantId: restaurant.id,
      customerIdentifier: customerPhone || null,
      customerUsageCount,
      now: new Date(),
    });

    if (!evaluation.valid) {
      return NextResponse.json(
        {
          success: false,
          code: evaluation.errorCode || "COUPON_INELIGIBLE",
          error: evaluation.error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        couponId: coupon.id,
        code: coupon.code,
        description: coupon.description,
        discountType: coupon.discountType,
        discountValue: Number(coupon.discountValue),
        minOrderSubtotal: Number(coupon.minOrderSubtotal),
        maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
        discountAmount: Number(evaluation.discountAmount),
      },
    });
  } catch (error) {
    console.error("Coupon validation error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "Failed to validate coupon." },
      { status: 500 }
    );
  }
}
