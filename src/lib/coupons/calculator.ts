import { Prisma, CouponDiscountType } from "@prisma/client";
import { roundDecimal } from "@/lib/orders/tax";

export interface CouponEvaluationData {
  id: string;
  restaurantId: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: Prisma.Decimal | number | string;
  minOrderSubtotal: Prisma.Decimal | number | string;
  maxDiscount: Prisma.Decimal | number | string | null;
  startDate: Date | string;
  endDate: Date | string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
}

export interface CouponValidationContext {
  subtotal: Prisma.Decimal | number | string;
  customerIdentifier?: string | null;
  customerUsageCount?: number;
  restaurantId: string;
  now?: Date;
}

export interface CouponValidationResult {
  valid: boolean;
  code: string;
  couponId?: string;
  discountAmount: Prisma.Decimal;
  discountFormatted: string;
  error?: string;
  errorCode?:
    | "INVALID_CODE"
    | "INACTIVE"
    | "NOT_STARTED"
    | "EXPIRED"
    | "TENANT_MISMATCH"
    | "MIN_SUBTOTAL_NOT_MET"
    | "USAGE_LIMIT_EXCEEDED"
    | "CUSTOMER_LIMIT_EXCEEDED";
}

/**
 * Calculates discount amount based on discount type, value, subtotal, and max discount cap.
 * Ensures discount never exceeds the eligible subtotal and is properly rounded to 2 decimal places.
 */
export function calculateCouponDiscount(
  coupon: {
    discountType: CouponDiscountType;
    discountValue: Prisma.Decimal | number | string;
    maxDiscount?: Prisma.Decimal | number | string | null;
  },
  subtotalInput: Prisma.Decimal | number | string
): Prisma.Decimal {
  const zero = new Prisma.Decimal("0.00");
  const subtotal = roundDecimal(new Prisma.Decimal(subtotalInput));
  if (subtotal.lte(0)) return zero;

  const value = new Prisma.Decimal(coupon.discountValue);
  let discount: Prisma.Decimal;

  if (coupon.discountType === CouponDiscountType.PERCENTAGE) {
    const oneHundred = new Prisma.Decimal("100");
    const rawDiscount = subtotal.mul(value).div(oneHundred);
    discount = roundDecimal(rawDiscount);

    if (coupon.maxDiscount !== null && coupon.maxDiscount !== undefined) {
      const cap = roundDecimal(new Prisma.Decimal(coupon.maxDiscount));
      if (cap.gt(0) && discount.gt(cap)) {
        discount = cap;
      }
    }
  } else {
    // FIXED amount discount
    discount = roundDecimal(value);
  }

  // Discount can never exceed subtotal
  if (discount.gt(subtotal)) {
    discount = subtotal;
  }

  return discount.gte(0) ? discount : zero;
}

/**
 * Evaluates whether a coupon is eligible for a given restaurant order context.
 */
export function validateCouponEligibility(
  coupon: CouponEvaluationData,
  context: CouponValidationContext
): CouponValidationResult {
  const zero = new Prisma.Decimal("0.00");
  const now = context.now || new Date();
  const subtotal = roundDecimal(new Prisma.Decimal(context.subtotal));

  // 1. Tenant match check
  if (coupon.restaurantId !== context.restaurantId) {
    return {
      valid: false,
      code: coupon.code,
      discountAmount: zero,
      discountFormatted: "0.00",
      errorCode: "TENANT_MISMATCH",
      error: "This coupon is not valid for this restaurant.",
    };
  }

  // 2. Active status check
  if (!coupon.isActive) {
    return {
      valid: false,
      code: coupon.code,
      discountAmount: zero,
      discountFormatted: "0.00",
      errorCode: "INACTIVE",
      error: `Coupon "${coupon.code}" is currently deactivated.`,
    };
  }

  // 3. Start date check
  const startDate = new Date(coupon.startDate);
  if (startDate.getTime() > now.getTime()) {
    return {
      valid: false,
      code: coupon.code,
      discountAmount: zero,
      discountFormatted: "0.00",
      errorCode: "NOT_STARTED",
      error: `Coupon "${coupon.code}" is not yet active.`,
    };
  }

  // 4. Expiry date check
  if (coupon.endDate) {
    const endDate = new Date(coupon.endDate);
    if (endDate.getTime() < now.getTime()) {
      return {
        valid: false,
        code: coupon.code,
        discountAmount: zero,
        discountFormatted: "0.00",
        errorCode: "EXPIRED",
        error: `Coupon "${coupon.code}" has expired.`,
      };
    }
  }

  // 5. Minimum Order Subtotal check
  const minSubtotal = roundDecimal(new Prisma.Decimal(coupon.minOrderSubtotal || 0));
  if (subtotal.lt(minSubtotal)) {
    return {
      valid: false,
      code: coupon.code,
      discountAmount: zero,
      discountFormatted: "0.00",
      errorCode: "MIN_SUBTOTAL_NOT_MET",
      error: `Minimum order subtotal of ₹${minSubtotal.toFixed(2)} required for coupon "${coupon.code}".`,
    };
  }

  // 6. Global Usage Limit check
  if (coupon.usageLimit !== null && coupon.usageLimit !== undefined) {
    if (coupon.usageCount >= coupon.usageLimit) {
      return {
        valid: false,
        code: coupon.code,
        discountAmount: zero,
        discountFormatted: "0.00",
        errorCode: "USAGE_LIMIT_EXCEEDED",
        error: `Coupon "${coupon.code}" has reached its maximum total redemptions.`,
      };
    }
  }

  // 7. Per-Customer Usage Limit check
  if (
    coupon.perCustomerLimit !== null &&
    coupon.perCustomerLimit !== undefined &&
    context.customerIdentifier
  ) {
    const customerUsed = context.customerUsageCount || 0;
    if (customerUsed >= coupon.perCustomerLimit) {
      return {
        valid: false,
        code: coupon.code,
        discountAmount: zero,
        discountFormatted: "0.00",
        errorCode: "CUSTOMER_LIMIT_EXCEEDED",
        error: `You have already redeemed coupon "${coupon.code}" the maximum allowed times (${coupon.perCustomerLimit}).`,
      };
    }
  }

  // 8. Calculate Discount
  const discountAmount = calculateCouponDiscount(
    {
      discountType: coupon.discountType,
      discountValue: coupon.discountValue,
      maxDiscount: coupon.maxDiscount,
    },
    subtotal
  );

  return {
    valid: true,
    code: coupon.code,
    couponId: coupon.id,
    discountAmount,
    discountFormatted: discountAmount.toFixed(2),
  };
}
