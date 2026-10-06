import { SubscriptionPlan, BillingPeriod } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

export interface PlanPricingDetails {
  plan: SubscriptionPlan;
  name: string;
  tableLimit: number;
  amountInRupees: number;
  amountInPaise: number;
  description: string;
}

export interface RestaurantCustomPricingDetails {
  billingPeriod: BillingPeriod;
  currency: string;
  amountInRupees: number;
  amountInPaise: number;
  monthlyPrice: number;
  yearlyPrice: number;
  description: string;
}

export const SMALL_PLAN_PRICE_RUPEES = 499;
export const SMALL_PLAN_MAX_TABLES = 5;

export const MEDIUM_PLAN_PRICE_RUPEES = 999;
export const MEDIUM_PLAN_MAX_TABLES = 10;

export const LARGE_PLAN_PRICE_PER_TABLE_RUPEES = 100;

/**
 * Calculates tenant-specific custom pricing for a restaurant.
 * Always resolves money values server-side to prevent client price tampering.
 * Amounts are converted to integer paise to eliminate floating-point inaccuracies.
 */
export function calculateRestaurantCustomPricing(
  subscription: {
    customMonthlyPrice?: Decimal | number | string | null;
    customYearlyPrice?: Decimal | number | string | null;
    billingPeriod?: BillingPeriod | null;
    currency?: string | null;
  } | null,
  requestedPeriod?: BillingPeriod
): RestaurantCustomPricingDetails {
  const monthlyPrice =
    subscription?.customMonthlyPrice != null
      ? Math.round(Number(subscription.customMonthlyPrice) * 100) / 100
      : 499;
  const yearlyPrice =
    subscription?.customYearlyPrice != null
      ? Math.round(Number(subscription.customYearlyPrice) * 100) / 100
      : 4990;

  const billingPeriod = requestedPeriod || subscription?.billingPeriod || BillingPeriod.MONTHLY;
  const currency = subscription?.currency || "INR";

  const amountInRupees = billingPeriod === BillingPeriod.YEARLY ? yearlyPrice : monthlyPrice;
  const amountInPaise = Math.round(amountInRupees * 100);

  const currencySymbol = currency === "INR" ? "₹" : `${currency} `;
  const periodLabel = billingPeriod === BillingPeriod.YEARLY ? "year" : "month";

  return {
    billingPeriod,
    currency,
    amountInRupees,
    amountInPaise,
    monthlyPrice,
    yearlyPrice,
    description: `${currencySymbol}${amountInRupees} / ${periodLabel}`,
  };
}

/**
 * Calculates official pricing and table limit for any of the 3 monthly plans.
 * Money is computed in integer paise to completely eliminate floating-point inaccuracies.
 */
export function calculatePlanPricing(
  plan: SubscriptionPlan,
  requestedTableCount?: number
): PlanPricingDetails {
  if (plan === SubscriptionPlan.SMALL) {
    return {
      plan: SubscriptionPlan.SMALL,
      name: "Small Restaurant",
      tableLimit: SMALL_PLAN_MAX_TABLES,
      amountInRupees: SMALL_PLAN_PRICE_RUPEES,
      amountInPaise: SMALL_PLAN_PRICE_RUPEES * 100, // 49,900 paise
      description: `Up to ${SMALL_PLAN_MAX_TABLES} tables included. ₹${SMALL_PLAN_PRICE_RUPEES}/month.`,
    };
  }

  if (plan === SubscriptionPlan.MEDIUM) {
    return {
      plan: SubscriptionPlan.MEDIUM,
      name: "Medium Restaurant",
      tableLimit: MEDIUM_PLAN_MAX_TABLES,
      amountInRupees: MEDIUM_PLAN_PRICE_RUPEES,
      amountInPaise: MEDIUM_PLAN_PRICE_RUPEES * 100, // 99,900 paise
      description: `Up to ${MEDIUM_PLAN_MAX_TABLES} tables included. ₹${MEDIUM_PLAN_PRICE_RUPEES}/month.`,
    };
  }

  if (plan === SubscriptionPlan.LARGE) {
    const tableCount = Math.floor(requestedTableCount ?? 0);
    if (!Number.isInteger(tableCount) || tableCount < 1) {
      throw new Error("Large plan requires selecting at least 1 table.");
    }

    const amountInRupees = tableCount * LARGE_PLAN_PRICE_PER_TABLE_RUPEES;
    const amountInPaise = amountInRupees * 100; // tableCount * 10,000 paise

    return {
      plan: SubscriptionPlan.LARGE,
      name: "Large Restaurant",
      tableLimit: tableCount,
      amountInRupees,
      amountInPaise,
      description: `${tableCount} tables at ₹${LARGE_PLAN_PRICE_PER_TABLE_RUPEES}/table/month (₹${amountInRupees}/month).`,
    };
  }

  throw new Error(`Unsupported subscription plan: ${plan}`);
}

/**
 * Verifies that a client-claimed amount exactly matches the server calculation.
 * Never trusts client-submitted money values.
 */
export function verifyClaimedPricing(
  plan: SubscriptionPlan,
  tableCount: number | undefined,
  claimedAmountPaise: number
): boolean {
  try {
    const official = calculatePlanPricing(plan, tableCount);
    return official.amountInPaise === claimedAmountPaise;
  } catch {
    return false;
  }
}

