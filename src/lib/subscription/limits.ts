import { prisma } from "@/lib/db/prisma";
import { evaluateSubscriptionStatus } from "./status";

export class TableLimitExceededError extends Error {
  statusCode: number;
  currentCount: number;
  maxLimit: number;
  constructor(message: string, currentCount: number, maxLimit: number) {
    super(message);
    this.name = "TableLimitExceededError";
    this.statusCode = 403;
    this.currentCount = currentCount;
    this.maxLimit = maxLimit;
  }
}

export class SubscriptionRequiredError extends Error {
  statusCode: number;
  constructor(message: string = "An active monthly subscription is required.") {
    super(message);
    this.name = "SubscriptionRequiredError";
    this.statusCode = 403;
  }
}

/**
 * Server-side guard to strictly enforce table creation limits.
 * Cannot be bypassed via direct API manipulation.
 *
 * Safe Policy:
 * - Existing tables and their QR tokens are NEVER deleted or dropped on downgrade/expiry.
 * - Adding NEW active tables is blocked if active count >= subscribed limit or if subscription is expired.
 */
export async function assertCanAddTable(restaurantId: string): Promise<{
  allowed: boolean;
  currentActiveCount: number;
  tableLimit: number;
  plan: string;
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { restaurantId },
  });

  const evaluation = evaluateSubscriptionStatus(subscription);

  if (!evaluation.hasSubscription) {
    throw new SubscriptionRequiredError(
      "No subscription found. Please subscribe to a monthly plan to create and manage tables."
    );
  }

  if (evaluation.isSuspended) {
    throw new SubscriptionRequiredError(
      "Your subscription is suspended. Please contact platform administration."
    );
  }

  if (evaluation.isExpired) {
    throw new SubscriptionRequiredError(
      "Your monthly subscription has expired. Please renew your subscription to create new tables. Existing tables remain preserved."
    );
  }

  const currentActiveCount = await prisma.table.count({
    where: {
      restaurantId,
      isActive: true,
    },
  });

  if (currentActiveCount >= evaluation.tableLimit) {
    throw new TableLimitExceededError(
      `Table limit reached. Your ${evaluation.plan} plan allows up to ${evaluation.tableLimit} active tables (currently using ${currentActiveCount}). Upgrade your plan or deactivate unused tables.`,
      currentActiveCount,
      evaluation.tableLimit
    );
  }

  return {
    allowed: true,
    currentActiveCount,
    tableLimit: evaluation.tableLimit,
    plan: evaluation.plan!,
  };
}

/**
 * Checks table usage metrics for a restaurant.
 */
export async function getTableUsageMetrics(restaurantId: string) {
  const subscription = await prisma.subscription.findUnique({
    where: { restaurantId },
  });

  const evaluation = evaluateSubscriptionStatus(subscription);

  const [totalCount, activeCount] = await Promise.all([
    prisma.table.count({ where: { restaurantId } }),
    prisma.table.count({ where: { restaurantId, isActive: true } }),
  ]);

  return {
    subscription: evaluation,
    totalTables: totalCount,
    activeTables: activeCount,
    remainingAllowance: Math.max(0, evaluation.tableLimit - activeCount),
    isAtLimit: activeCount >= evaluation.tableLimit,
  };
}
