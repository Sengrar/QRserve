import {
  Subscription,
  SubscriptionStatus,
  BillingPeriod,
  SubscriptionPaymentStatus,
} from "@prisma/client";

export interface EvaluatedSubscription {
  hasSubscription: boolean;
  isValid: boolean;
  isExpired: boolean;
  isSuspended: boolean;
  isNearExpiry: boolean;
  daysRemaining: number;
  tableLimit: number;
  plan: string | null;
  status: SubscriptionStatus | null;
  endDate: Date | null;
  billingPeriod: BillingPeriod;
  currency: string;
  customMonthlyPrice: number;
  customYearlyPrice: number;
  assignedAmount: number;
  paymentStatus: SubscriptionPaymentStatus;
  nextBillingDate: Date | null;
}

const NEAR_EXPIRY_THRESHOLD_DAYS = 7;
export const SUBSCRIPTION_DURATION_DAYS = 30;
export const SUBSCRIPTION_YEARLY_DAYS = 365;

/**
 * Evaluates the live operational status of a restaurant subscription.
 * An active subscription whose endDate is in the past is treated as EXPIRED.
 * Expired subscriptions NEVER silently auto-renew.
 */
export function evaluateSubscriptionStatus(
  subscription:
    | (Pick<Subscription, "status" | "endDate" | "tableLimit" | "plan"> &
        Partial<
          Pick<
            Subscription,
            | "billingPeriod"
            | "currency"
            | "customMonthlyPrice"
            | "customYearlyPrice"
            | "paymentStatus"
            | "nextBillingDate"
          >
        >)
    | null
): EvaluatedSubscription {
  if (!subscription) {
    return {
      hasSubscription: false,
      isValid: false,
      isExpired: false,
      isSuspended: false,
      isNearExpiry: false,
      daysRemaining: 0,
      tableLimit: 0,
      plan: null,
      status: null,
      endDate: null,
      billingPeriod: BillingPeriod.MONTHLY,
      currency: "INR",
      customMonthlyPrice: 499,
      customYearlyPrice: 4990,
      assignedAmount: 499,
      paymentStatus: SubscriptionPaymentStatus.PAID,
      nextBillingDate: null,
    };
  }

  const now = new Date();
  const endDate = new Date(subscription.endDate);
  const isPastEndDate = endDate.getTime() < now.getTime();
  const isSuspended = subscription.status === SubscriptionStatus.SUSPENDED;

  // Compute days remaining (rounded up)
  const msRemaining = endDate.getTime() - now.getTime();
  const daysRemaining = isPastEndDate
    ? 0
    : Math.ceil(msRemaining / (1000 * 60 * 60 * 24));

  const isExpired =
    subscription.status === SubscriptionStatus.EXPIRED ||
    (subscription.status === SubscriptionStatus.ACTIVE && isPastEndDate);

  const isValid =
    subscription.status === SubscriptionStatus.ACTIVE &&
    !isPastEndDate &&
    !isSuspended;

  const isNearExpiry = isValid && daysRemaining <= NEAR_EXPIRY_THRESHOLD_DAYS;

  const billingPeriod = subscription.billingPeriod || BillingPeriod.MONTHLY;
  const currency = subscription.currency || "INR";
  const customMonthlyPrice =
    subscription.customMonthlyPrice != null
      ? Math.round(Number(subscription.customMonthlyPrice) * 100) / 100
      : 499;
  const customYearlyPrice =
    subscription.customYearlyPrice != null
      ? Math.round(Number(subscription.customYearlyPrice) * 100) / 100
      : 4990;

  const assignedAmount =
    billingPeriod === BillingPeriod.YEARLY ? customYearlyPrice : customMonthlyPrice;

  const paymentStatus =
    subscription.paymentStatus || SubscriptionPaymentStatus.PAID;

  const nextBillingDate = subscription.nextBillingDate
    ? new Date(subscription.nextBillingDate)
    : endDate;

  return {
    hasSubscription: true,
    isValid,
    isExpired,
    isSuspended,
    isNearExpiry,
    daysRemaining,
    tableLimit: subscription.tableLimit,
    plan: subscription.plan,
    status: isExpired ? SubscriptionStatus.EXPIRED : subscription.status,
    endDate,
    billingPeriod,
    currency,
    customMonthlyPrice,
    customYearlyPrice,
    assignedAmount,
    paymentStatus,
    nextBillingDate,
  };
}

/**
 * Calculates start and end dates for a new or renewed cycle.
 * Supports both MONTHLY (30 days) and YEARLY (365 days).
 * If renewing before expiry, extends from current endDate.
 * If expired or new, starts immediately from current timestamp.
 */
export function calculateSubscriptionCycleDates(
  currentSubscription: Pick<Subscription, "status" | "endDate"> | null,
  period: BillingPeriod = BillingPeriod.MONTHLY
): { startDate: Date; endDate: Date } {
  const now = new Date();
  const durationDays =
    period === BillingPeriod.YEARLY ? SUBSCRIPTION_YEARLY_DAYS : SUBSCRIPTION_DURATION_DAYS;
  const msDuration = durationDays * 24 * 60 * 60 * 1000;

  if (
    currentSubscription &&
    currentSubscription.status === SubscriptionStatus.ACTIVE &&
    new Date(currentSubscription.endDate).getTime() > now.getTime()
  ) {
    // Early renewal: extend from current end date
    const currentEnd = new Date(currentSubscription.endDate);
    const newEnd = new Date(currentEnd.getTime() + msDuration);
    return {
      startDate: now,
      endDate: newEnd,
    };
  }

  // Fresh activation or renewing after expiry
  return {
    startDate: now,
    endDate: new Date(now.getTime() + msDuration),
  };
}

