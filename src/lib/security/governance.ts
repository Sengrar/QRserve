import { ApprovalStatus, SubscriptionStatus } from "@prisma/client";

/**
 * Pure domain rule:
 * Only approved, activated, non-suspended restaurants can provide public QR ordering.
 * If subscription details are provided, an expired or suspended subscription halts ordering.
 */
export function canPubliclyAccessRestaurant(restaurant: {
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  isSuspended: boolean;
  subscription?: {
    status: SubscriptionStatus;
    endDate: Date;
  } | null;
}): boolean {
  const isGovernanceApproved =
    restaurant.approvalStatus === ApprovalStatus.APPROVED &&
    restaurant.isActive === true &&
    restaurant.isSuspended === false;

  if (!isGovernanceApproved) {
    return false;
  }

  // If subscription data is passed, verify it is active and not expired
  if (restaurant.subscription !== undefined) {
    if (!restaurant.subscription) {
      return false; // No subscription
    }
    const isPastEnd = new Date(restaurant.subscription.endDate).getTime() < Date.now();
    if (
      restaurant.subscription.status !== SubscriptionStatus.ACTIVE ||
      isPastEnd
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Evaluates governance breakdown for display across UI and API layers.
 */
export function evaluateRestaurantGovernance(restaurant: {
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  isSuspended: boolean;
  subscription?: {
    status: SubscriptionStatus;
    endDate: Date;
  } | null;
}) {
  const isApproved = restaurant.approvalStatus === ApprovalStatus.APPROVED;
  const isPending = restaurant.approvalStatus === ApprovalStatus.PENDING;
  const isRejected = restaurant.approvalStatus === ApprovalStatus.REJECTED;
  const isActive = restaurant.isActive;
  const isSuspended = restaurant.isSuspended;

  let subscriptionValid = true;
  let subscriptionExpired = false;

  if (restaurant.subscription !== undefined) {
    if (!restaurant.subscription) {
      subscriptionValid = false;
    } else {
      const isPastEnd = new Date(restaurant.subscription.endDate).getTime() < Date.now();
      if (restaurant.subscription.status !== SubscriptionStatus.ACTIVE || isPastEnd) {
        subscriptionValid = false;
        subscriptionExpired = isPastEnd;
      }
    }
  }

  const canAcceptOrders = canPubliclyAccessRestaurant(restaurant);

  return {
    isApproved,
    isPending,
    isRejected,
    isActive,
    isSuspended,
    subscriptionValid,
    subscriptionExpired,
    canAcceptOrders,
  };
}
