import { OrderStatus } from "@prisma/client";

/**
 * Valid state transitions for the QRServe Kitchen Order Management System.
 *
 * Lifecycle:
 * SUBMITTED -> CONFIRMED -> PREPARING -> SERVED -> COMPLETED
 * Any active order (SUBMITTED, CONFIRMED, PREPARING, SERVED) can transition to CANCELLED.
 * COMPLETED and CANCELLED are terminal states and cannot transition further.
 */
export const VALID_ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.SUBMITTED]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PREPARING, OrderStatus.CANCELLED],
  [OrderStatus.PREPARING]: [OrderStatus.SERVED, OrderStatus.CANCELLED],
  [OrderStatus.SERVED]: [OrderStatus.COMPLETED, OrderStatus.CANCELLED],
  [OrderStatus.COMPLETED]: [],
  [OrderStatus.CANCELLED]: [],
};

export interface TransitionValidationResult {
  valid: boolean;
  isNoop: boolean;
  error?: string;
}

/**
 * Validates whether transitioning an order from currentStatus to targetStatus is permitted.
 * If currentStatus === targetStatus, the operation is treated as an idempotent no-op.
 */
export function validateOrderStatusTransition(
  currentStatus: OrderStatus,
  targetStatus: OrderStatus
): TransitionValidationResult {
  // Idempotent / repeated update (e.g. two waiters clicking the same button concurrently)
  if (currentStatus === targetStatus) {
    return {
      valid: true,
      isNoop: true,
    };
  }

  const allowedNext = VALID_ORDER_TRANSITIONS[currentStatus] || [];
  if (allowedNext.includes(targetStatus)) {
    return {
      valid: true,
      isNoop: false,
    };
  }

  if (currentStatus === OrderStatus.COMPLETED) {
    return {
      valid: false,
      isNoop: false,
      error: "Completed orders are finalized and cannot be modified.",
    };
  }

  if (currentStatus === OrderStatus.CANCELLED) {
    return {
      valid: false,
      isNoop: false,
      error: "Cancelled orders cannot be reopened or transitioned.",
    };
  }

  return {
    valid: false,
    isNoop: false,
    error: `Cannot transition order status from ${currentStatus} to ${targetStatus}.`,
  };
}

/**
 * Returns available next valid statuses for a given current status.
 */
export function getAvailableNextStatuses(currentStatus: OrderStatus): OrderStatus[] {
  return VALID_ORDER_TRANSITIONS[currentStatus] || [];
}

/**
 * Human-readable metadata and action labels for each OrderStatus.
 */
export interface OrderStatusConfig {
  label: string;
  shortLabel: string;
  description: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  nextActionLabel?: string;
  nextStatus?: OrderStatus;
  isTerminal: boolean;
}

export const ORDER_STATUS_CONFIG: Record<OrderStatus, OrderStatusConfig> = {
  [OrderStatus.SUBMITTED]: {
    label: "New / Submitted",
    shortLabel: "New",
    description: "Order placed by customer, awaiting kitchen confirmation",
    badgeBg: "bg-amber-500/20",
    badgeText: "text-amber-300",
    badgeBorder: "border-amber-500/30",
    nextActionLabel: "Confirm Order",
    nextStatus: OrderStatus.CONFIRMED,
    isTerminal: false,
  },
  [OrderStatus.CONFIRMED]: {
    label: "Confirmed",
    shortLabel: "Confirmed",
    description: "Order confirmed, ready to be sent to kitchen",
    badgeBg: "bg-blue-500/20",
    badgeText: "text-blue-300",
    badgeBorder: "border-blue-500/30",
    nextActionLabel: "Start Preparing",
    nextStatus: OrderStatus.PREPARING,
    isTerminal: false,
  },
  [OrderStatus.PREPARING]: {
    label: "Preparing",
    shortLabel: "Preparing",
    description: "Dishes are actively being cooked in the kitchen",
    badgeBg: "bg-purple-500/20",
    badgeText: "text-purple-300",
    badgeBorder: "border-purple-500/30",
    nextActionLabel: "Mark Dishes Served",
    nextStatus: OrderStatus.SERVED,
    isTerminal: false,
  },
  [OrderStatus.SERVED]: {
    label: "Served / Ready to Complete",
    shortLabel: "Served",
    description: "Food delivered to table, ready for bill closure",
    badgeBg: "bg-emerald-500/20",
    badgeText: "text-emerald-300",
    badgeBorder: "border-emerald-500/30",
    nextActionLabel: "Complete & Archive",
    nextStatus: OrderStatus.COMPLETED,
    isTerminal: false,
  },
  [OrderStatus.COMPLETED]: {
    label: "Completed",
    shortLabel: "Completed",
    description: "Order fulfilled and finalized",
    badgeBg: "bg-slate-800",
    badgeText: "text-slate-300",
    badgeBorder: "border-slate-700",
    isTerminal: true,
  },
  [OrderStatus.CANCELLED]: {
    label: "Cancelled",
    shortLabel: "Cancelled",
    description: "Order cancelled",
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-400",
    badgeBorder: "border-rose-500/30",
    isTerminal: true,
  },
};
