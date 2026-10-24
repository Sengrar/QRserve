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
/**
 * Server-side guard to strictly enforce table creation limits.
 * Cannot be bypassed via direct API manipulation.
 *
 * Safe Policy:
 * - Existing tables and their QR tokens are NEVER deleted or dropped on downgrade/expiry.
 * - Adding NEW active tables is blocked if active count >= subscribed limit or if subscription is expired.
 */
export async function assertCanAddTable(
  restaurantId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any = prisma
): Promise<{
  allowed: boolean;
  currentActiveCount: number;
  tableLimit: number;
  plan: string;
}> {
  const subscription = await dbClient.subscription.findUnique({
    where: { restaurantId },
  });

  const evaluation = evaluateSubscriptionStatus(subscription);

  if (!evaluation.hasSubscription) {
    throw new SubscriptionRequiredError(
      "No subscription found. Please subscribe to a monthly plan or contact administration to set your allowed tables."
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

  const currentActiveCount = await dbClient.table.count({
    where: {
      restaurantId,
      isActive: true,
    },
  });

  if (currentActiveCount >= evaluation.tableLimit) {
    throw new TableLimitExceededError(
      `Table limit reached. Your ${evaluation.plan} plan allows up to ${evaluation.tableLimit} active tables (${currentActiveCount} / ${evaluation.tableLimit} tables used). This restaurant has reached its allowed table limit. Upgrade your plan or contact administration to increase your allowed table limit.`,
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
 * Optionally accepts pre-computed counts to avoid redundant database round-trips.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getTableUsageMetrics(
  restaurantId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any = prisma,
  knownCounts?: { totalTables?: number; activeTables?: number }
) {
  const subscription = await dbClient.subscription.findUnique({
    where: { restaurantId },
  });

  const evaluation = evaluateSubscriptionStatus(subscription);

  let totalCount: number;
  let activeCount: number;

  if (knownCounts?.totalTables !== undefined && knownCounts?.activeTables !== undefined) {
    totalCount = knownCounts.totalTables;
    activeCount = knownCounts.activeTables;
  } else {
    const [t, a] = await Promise.all([
      dbClient.table.count({ where: { restaurantId } }),
      dbClient.table.count({ where: { restaurantId, isActive: true } }),
    ]);
    totalCount = t;
    activeCount = a;
  }

  return {
    subscription: evaluation,
    totalTables: totalCount,
    activeTables: activeCount,
    remainingAllowance: Math.max(0, evaluation.tableLimit - activeCount),
    isAtLimit: activeCount >= evaluation.tableLimit,
  };
}
