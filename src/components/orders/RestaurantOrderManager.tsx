"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { OrderStatus } from "@prisma/client";
import {
  ShoppingBag,
  Clock,
  QrCode,
  Store,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ChefHat,
  ChevronRight,
  TrendingUp,
  FileText,
  LayoutGrid,
  List,
  Search,
  ArrowUpDown,
  Flame,
  Check,
  Ban,
} from "lucide-react";
import {
  ORDER_STATUS_CONFIG,
  validateOrderStatusTransition,
} from "@/lib/orders/transitions";
import { useRestaurantNotifications } from "@/context/RestaurantNotificationContext";

export interface OrderItemData {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  taxableAmount?: number;
  notes: string | null;
}

export interface AdminOrderData {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerNotes: string | null;
  subtotal: number;
  discountAmount?: number;
  couponCode?: string | null;
  taxRate?: number;
  taxAmount?: number;
  taxMode?: "EXCLUSIVE" | "INCLUSIVE";
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  table: {
    tableNumber: string;
    name: string | null;
  } | null;
  items: OrderItemData[];
}

interface RestaurantOrderManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  initialOrders: AdminOrderData[];
}

type ViewMode = "KANBAN" | "QUEUE";
type SortMode = "OLDEST" | "NEWEST";

/**
 * Audio chime using Web Audio API (no external file dependencies)
 */
function playChime() {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.12); // A5

    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch {
    // Silently ignore audio autoplay restrictions
  }
}

/**
 * Calculates human-readable elapsed time and urgency level.
 */
function getElapsedTimeInfo(createdAt: string, now: Date) {
  const createdDate = new Date(createdAt);
  const diffSec = Math.max(0, Math.floor((now.getTime() - createdDate.getTime()) / 1000));

  let timeString = "";
  if (diffSec < 60) {
    timeString = "Just now";
  } else if (diffSec < 3600) {
    const mins = Math.floor(diffSec / 60);
    timeString = `${mins}m ago`;
  } else if (diffSec < 86400) {
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    timeString = `${hours}h ${mins}m ago`;
  } else {
    const days = Math.floor(diffSec / 86400);
    timeString = `${days}d ago`;
  }

  // Urgency for pending kitchen orders
  const diffMins = Math.floor(diffSec / 60);
  let urgency: "normal" | "warning" | "urgent" = "normal";
  if (diffMins >= 20) {
    urgency = "urgent";
  } else if (diffMins >= 10) {
    urgency = "warning";
  }

  return { timeString, urgency, diffMins };
}

export function RestaurantOrderManager({
  restaurant,
  initialOrders,
}: RestaurantOrderManagerProps) {
  const [orders, setOrders] = useState<AdminOrderData[]>(initialOrders);
  const [statusFilter, setStatusFilter] = useState<string>("ACTIVE");
  const [viewMode, setViewMode] = useState<ViewMode>("KANBAN");
  const [sortMode, setSortMode] = useState<SortMode>("OLDEST");
  const [searchQuery, setSearchQuery] = useState("");
  const { soundEnabled } = useRestaurantNotifications();
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isManualRefreshing, setIsManualRefreshing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [cancelModalOrder, setCancelModalOrder] = useState<AdminOrderData | null>(null);
  const [now, setNow] = useState<Date>(new Date());

  const knownOrderIdsRef = useRef<Set<string>>(new Set(initialOrders.map((o) => o.id)));

  // Live timer tick every 15 seconds to update elapsed time accurately
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(new Date());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  // Clear success toast automatically
  useEffect(() => {
    if (!successToast) return;
    const timer = setTimeout(() => {
      setSuccessToast(null);
    }, 4000);
    return () => clearInterval(timer);
  }, [successToast]);

  // Fetch orders silently for background polling, or visibly for manual refresh
  const fetchOrders = useCallback(
    async (isManual = false) => {
      if (isManual) setIsManualRefreshing(true);
      try {
        const res = await fetch(`/api/restaurants/${restaurant.id}/orders?limit=150`);
        const json = await res.json();

        if (res.ok && json.success) {
          const freshOrders: AdminOrderData[] = json.data;

          // Check if brand new orders arrived for sound notification
          const currentIds = knownOrderIdsRef.current;
          let hasNewIncoming = false;

          for (const ord of freshOrders) {
            if (!currentIds.has(ord.id)) {
              currentIds.add(ord.id);
              if (ord.status === OrderStatus.SUBMITTED) {
                hasNewIncoming = true;
              }
            }
          }

          if (hasNewIncoming && soundEnabled) {
            playChime();
            setSuccessToast("🔔 New incoming order placed by customer!");
          }

          setOrders(freshOrders);
          setError(null);
        } else if (isManual) {
          setError(json.error || "Failed to refresh orders.");
        }
      } catch {
        if (isManual) {
          setError("Network connection issue while updating kitchen queue.");
        }
      } finally {
        if (isManual) setIsManualRefreshing(false);
      }
    },
    [restaurant.id, soundEnabled]
  );

  // Background polling every 10 seconds with Page Visibility API support
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return; // Pause polling when tab is hidden to save battery and network
      }
      fetchOrders(false);
    }, 10000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchOrders]);

  // Execute status update with transition validation and feedback
  async function handleUpdateStatus(order: AdminOrderData, nextStatus: OrderStatus) {
    // Validate on client before submitting
    const check = validateOrderStatusTransition(order.status, nextStatus);
    if (!check.valid) {
      setError(check.error || "Invalid status transition.");
      return;
    }

    setActionLoadingId(order.id);
    setError(null);

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/orders/${order.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        if (res.status === 409) {
          // Concurrent conflict: refresh latest data
          setError(json.error || "Order status was updated by another staff member.");
          fetchOrders(false);
        } else {
          setError(json.error || "Failed to update order status.");
        }
        return;
      }

      // Update local state smoothly
      setOrders((prev) =>
        prev.map((o) =>
          o.id === order.id ? { ...o, status: nextStatus, updatedAt: new Date().toISOString() } : o
        )
      );

      const targetLabel = ORDER_STATUS_CONFIG[nextStatus]?.label || nextStatus;
      setSuccessToast(`Order #${order.orderNumber} updated to ${targetLabel}`);

      if (cancelModalOrder?.id === order.id) {
        setCancelModalOrder(null);
      }
    } catch {
      setError("Network error updating order status. Please check your connection.");
    } finally {
      setActionLoadingId(null);
    }
  }

  // Filtered and searched orders
  const processedOrders = useMemo(() => {
    return orders
      .filter((order) => {
        // Status filter
        if (statusFilter === "ACTIVE") {
          const isActive =
            order.status === OrderStatus.SUBMITTED ||
            order.status === OrderStatus.CONFIRMED ||
            order.status === OrderStatus.PREPARING ||
            order.status === OrderStatus.SERVED;
          if (!isActive) return false;
        } else if (statusFilter !== "ALL") {
          if (order.status !== statusFilter) return false;
        }

        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchOrderNumber = order.orderNumber.toLowerCase().includes(q);
          const matchTable =
            order.table?.tableNumber.toLowerCase().includes(q) ||
            (order.table?.name && order.table.name.toLowerCase().includes(q));
          const matchItems = order.items.some((it) => it.itemName.toLowerCase().includes(q));
          const matchNotes = order.customerNotes?.toLowerCase().includes(q);

          if (!matchOrderNumber && !matchTable && !matchItems && !matchNotes) {
            return false;
          }
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return sortMode === "OLDEST" ? timeA - timeB : timeB - timeA;
      });
  }, [orders, statusFilter, searchQuery, sortMode]);

  // Statistics calculation
  const stats = useMemo(() => {
    const submitted = orders.filter((o) => o.status === OrderStatus.SUBMITTED).length;
    const confirmed = orders.filter((o) => o.status === OrderStatus.CONFIRMED).length;
    const preparing = orders.filter((o) => o.status === OrderStatus.PREPARING).length;
    const served = orders.filter((o) => o.status === OrderStatus.SERVED).length;
    const inKitchen = confirmed + preparing;
    const completed = orders.filter((o) => o.status === OrderStatus.COMPLETED).length;
    const cancelled = orders.filter((o) => o.status === OrderStatus.CANCELLED).length;
    const totalActive = submitted + confirmed + preparing + served;
    const nonCancelledSales = orders
      .filter((o) => o.status !== OrderStatus.CANCELLED)
      .reduce((sum, o) => sum + o.totalAmount, 0);

    return {
      submitted,
      confirmed,
      preparing,
      served,
      inKitchen,
      completed,
      cancelled,
      totalActive,
      nonCancelledSales,
    };
  }, [orders]);

  // Render order card component
  const renderOrderCard = (order: AdminOrderData) => {
    const isActing = actionLoadingId === order.id;
    const config = ORDER_STATUS_CONFIG[order.status];
    const { timeString, urgency } = getElapsedTimeInfo(order.createdAt, now);
    const isActive =
      order.status === OrderStatus.SUBMITTED ||
      order.status === OrderStatus.CONFIRMED ||
      order.status === OrderStatus.PREPARING ||
      order.status === OrderStatus.SERVED;

    return (
      <div
        key={order.id}
        className={`glass-card rounded-2xl p-4 sm:p-5 border transition-all flex flex-col justify-between space-y-4 shadow-sm ${
          urgency === "urgent" && isActive
            ? "border-rose-500/50 bg-rose-950/10 shadow-rose-950/20"
            : urgency === "warning" && isActive
            ? "border-amber-500/40 bg-amber-950/10"
            : "border-slate-800/80 hover:border-slate-700 bg-slate-900/60"
        }`}
      >
        <div>
          {/* Card Top: Order Number, Table & Elapsed Time */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-mono font-extrabold text-amber-400 tracking-wider">
                  {order.orderNumber}
                </span>

                {order.table ? (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <QrCode className="w-3 h-3 text-amber-400" />
                    <span>
                      Table {order.table.tableNumber}
                      {order.table.name ? ` (${order.table.name})` : ""}
                    </span>
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                    <Store className="w-3 h-3 text-slate-400" />
                    <span>Counter / Takeaway</span>
                  </span>
                )}
              </div>

              {/* Order Creation Time and Live Elapsed Time */}
              <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-1 font-mono flex-wrap">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-500" />
                  <span suppressHydrationWarning>
                    {new Date(order.createdAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>

                <span className="text-slate-600">•</span>

                {/* Elapsed Time Badge */}
                <span
                  className={`px-1.5 py-0.2 rounded font-semibold text-[10px] flex items-center gap-1 ${
                    urgency === "urgent" && isActive
                      ? "bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse font-bold"
                      : urgency === "warning" && isActive
                      ? "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                      : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {urgency === "urgent" && isActive && <Flame className="w-3 h-3 text-rose-400" />}
                  <span>{timeString}</span>
                </span>
              </div>
            </div>

            {/* Status Badge */}
            <div className="flex-shrink-0">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border flex items-center gap-1.5 ${
                  config.badgeBg
                } ${config.badgeText} ${config.badgeBorder} ${
                  order.status === OrderStatus.SUBMITTED ? "animate-pulse" : ""
                }`}
              >
                {order.status === OrderStatus.SUBMITTED && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                )}
                {order.status === OrderStatus.PREPARING && (
                  <ChefHat className="w-3 h-3 text-purple-400" />
                )}
                {order.status === OrderStatus.SERVED && (
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                )}
                <span>{config.shortLabel}</span>
              </span>
            </div>
          </div>

          {/* Ordered Item Names and Quantities + Item-Level Instructions */}
          <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 divide-y divide-slate-800/50">
            {order.items.map((item) => (
              <div key={item.id} className="py-1.5 flex items-start justify-between gap-2 text-xs">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-white flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[11px] border border-slate-700">
                      {item.quantity}×
                    </span>
                    <span className="truncate">{item.itemName}</span>
                    {item.taxRate !== undefined && item.taxRate > 0 && (
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/15 text-purple-300 border border-purple-500/25 font-mono">
                        {item.taxRate}% GST
                      </span>
                    )}
                  </div>

                  {/* Item-level special instructions */}
                  {item.notes && (
                    <div className="mt-0.5 pl-5 text-[11px] text-amber-300/90 italic flex items-center gap-1">
                      <span className="text-amber-500 font-bold">↳</span>
                      <span>&ldquo;{item.notes}&rdquo;</span>
                    </div>
                  )}
                </div>

                <div className="font-mono text-slate-300 text-[11px] font-medium flex-shrink-0">
                  ₹{item.subtotal.toFixed(2)}
                </div>
              </div>
            ))}
          </div>

          {/* Order-level special instructions */}
          {order.customerNotes && (
            <div className="mt-3 p-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs flex items-start gap-2 text-amber-200/90">
              <FileText className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Kitchen Instructions:
                </span>
                <p className="italic text-slate-200 mt-0.5">&ldquo;{order.customerNotes}&rdquo;</p>
              </div>
            </div>
          )}

          {/* Order Financial Breakdown */}
          <div className="mt-3 pt-2 border-t border-slate-800/70 space-y-1 text-xs">
            {order.taxAmount && order.taxAmount > 0 ? (
              <>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{order.subtotal.toFixed(2)}</span>
                </div>
                {order.discountAmount !== undefined && order.discountAmount > 0 ? (
                  <div className="flex justify-between text-emerald-400 text-[11px] font-semibold">
                    <span>Coupon {order.couponCode ? `(${order.couponCode})` : ""}:</span>
                    <span className="font-mono">-₹{order.discountAmount.toFixed(2)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between text-amber-300 text-[11px]">
                  <span>
                    GST ({order.taxRate}%)
                    {order.taxMode === "INCLUSIVE" ? " (incl)" : ""}:
                  </span>
                  <span className="font-mono">₹{order.taxAmount.toFixed(2)}</span>
                </div>
              </>
            ) : order.discountAmount !== undefined && order.discountAmount > 0 ? (
              <>
                <div className="flex justify-between text-slate-400 text-[11px]">
                  <span>Subtotal:</span>
                  <span className="font-mono">₹{order.subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-emerald-400 text-[11px] font-semibold">
                  <span>Coupon {order.couponCode ? `(${order.couponCode})` : ""}:</span>
                  <span className="font-mono">-₹{order.discountAmount.toFixed(2)}</span>
                </div>
              </>
            ) : null}
            <div className="flex justify-between items-baseline pt-0.5">
              <span className="text-slate-300 font-medium">Total Bill</span>
              <span className="text-sm sm:text-base font-extrabold text-white font-mono">
                ₹{order.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Appropriate Next-Action Buttons */}
        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-wrap">
          {order.status === OrderStatus.SUBMITTED && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateStatus(order, OrderStatus.CONFIRMED)}
                disabled={isActing}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-amber-500/10"
              >
                {isActing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Confirm Order</span>
              </button>

              <button
                type="button"
                onClick={() => setCancelModalOrder(order)}
                disabled={isActing}
                title="Cancel this order"
                className="py-2 px-3 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/25 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {order.status === OrderStatus.CONFIRMED && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateStatus(order, OrderStatus.PREPARING)}
                disabled={isActing}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-purple-600/15"
              >
                {isActing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ChefHat className="w-3.5 h-3.5" />
                )}
                <span>Send to Kitchen</span>
              </button>

              <button
                type="button"
                onClick={() => setCancelModalOrder(order)}
                disabled={isActing}
                className="py-2 px-3 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/25 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {order.status === OrderStatus.PREPARING && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateStatus(order, OrderStatus.SERVED)}
                disabled={isActing}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-950 bg-emerald-400 hover:bg-emerald-300 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-500/15"
              >
                {isActing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                <span>Mark Dishes Served</span>
              </button>

              <button
                type="button"
                onClick={() => setCancelModalOrder(order)}
                disabled={isActing}
                className="py-2 px-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/25 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {order.status === OrderStatus.SERVED && (
            <>
              <button
                type="button"
                onClick={() => handleUpdateStatus(order, OrderStatus.COMPLETED)}
                disabled={isActing}
                className="flex-1 py-2 px-3 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isActing ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-amber-400" />
                )}
                <span>Complete & Archive</span>
              </button>

              <button
                type="button"
                onClick={() => setCancelModalOrder(order)}
                disabled={isActing}
                className="py-2 px-2.5 rounded-xl text-xs font-medium text-rose-400 hover:bg-rose-500/10 border border-rose-500/25 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </>
          )}

          {order.status === OrderStatus.COMPLETED && (
            <div className="w-full text-center py-1 text-[11px] text-slate-400 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
              <span>Fulfilled and archived</span>
            </div>
          )}

          {order.status === OrderStatus.CANCELLED && (
            <div className="w-full text-center py-1 text-[11px] text-rose-400/80 flex items-center justify-center gap-1">
              <XCircle className="w-3.5 h-3.5 text-rose-400" />
              <span>Order was cancelled</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Kitchen Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
              <ChefHat className="w-7 h-7 text-amber-400" />
              <span>Kitchen & Orders</span>
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {restaurant.name}
            </span>
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>Live Queue</span>
            </div>
          </div>
          <p className="mt-1 text-xs sm:text-sm text-slate-400">
            Real-time kitchen order management for QR dine-in tables and counter orders.
          </p>
        </div>

        {/* Live Controls: Polling, Refresh */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Auto Refresh Toggle */}
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none bg-slate-900 border border-slate-800 px-3 py-2 rounded-xl hover:border-slate-700 transition">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded accent-amber-500 w-3.5 h-3.5"
            />
            <span className="hidden sm:inline">Auto-sync (10s)</span>
            <span className="sm:hidden">Auto</span>
          </label>

          {/* Manual Refresh */}
          <button
            type="button"
            onClick={() => fetchOrders(true)}
            disabled={isManualRefreshing}
            className="px-3 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isManualRefreshing ? "animate-spin text-amber-400" : ""}`} />
            <span>Refresh</span>
          </button>

          {/* View Mode Toggle: Kanban vs Queue */}
          <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("KANBAN")}
              title="Station Kanban Board View"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                viewMode === "KANBAN"
                  ? "bg-amber-400 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Stations</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("QUEUE")}
              title="Order Queue List View"
              className={`p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1 cursor-pointer ${
                viewMode === "QUEUE"
                  ? "bg-amber-400 text-slate-950 font-bold"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications / Toast / Feedback */}
      {successToast && (
        <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg shadow-emerald-500/5 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="font-semibold">{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-emerald-400/80 hover:text-emerald-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between shadow-lg shadow-rose-500/5">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => setError(null)}
            className="text-rose-400/80 hover:text-rose-200 text-xs"
          >
            ✕
          </button>
        </div>
      )}

      {/* Real-Time Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          onClick={() => setStatusFilter(OrderStatus.SUBMITTED)}
          className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 hover:border-amber-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">New Placed</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono flex items-baseline gap-2">
            <span>{stats.submitted}</span>
            {stats.submitted > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
          <div className="text-[11px] text-amber-400/80 mt-1">Awaiting confirmation</div>
        </div>

        <div
          onClick={() => setStatusFilter("ACTIVE")}
          className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 hover:border-purple-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Kitchen Preparing</span>
            <ChefHat className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
            {stats.inKitchen}
          </div>
          <div className="text-[11px] text-purple-400/80 mt-1">
            {stats.confirmed} confirmed • {stats.preparing} cooking
          </div>
        </div>

        <div
          onClick={() => setStatusFilter(OrderStatus.SERVED)}
          className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 hover:border-emerald-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Dishes Served</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
            {stats.served}
          </div>
          <div className="text-[11px] text-emerald-400/80 mt-1">Ready for bill settlement</div>
        </div>

        <div
          onClick={() => setStatusFilter(OrderStatus.COMPLETED)}
          className="glass-card rounded-2xl p-4 sm:p-5 border border-slate-800 hover:border-cyan-500/40 cursor-pointer transition"
        >
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Completed</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
            {stats.completed}
          </div>
          <div className="text-[11px] text-cyan-400/80 mt-1">
            Total sales: ₹{stats.nonCancelledSales.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Search Bar & Sort Order Row */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search order #, table #, or dish name..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
            >
              ✕
            </button>
          )}
        </div>

        {/* Sort Order Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSortMode((prev) => (prev === "OLDEST" ? "NEWEST" : "OLDEST"))}
            className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 transition flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
            <span>
              Sort: {sortMode === "OLDEST" ? "Oldest First (FIFO Queue)" : "Newest First"}
            </span>
          </button>
        </div>
      </div>

      {/* Filter Tabs for Quick Selection */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scrollbar-none border-b border-slate-800/80">
        {[
          { key: "ACTIVE", label: `Active Kitchen (${stats.totalActive})` },
          { key: OrderStatus.SUBMITTED, label: `New (${stats.submitted})` },
          { key: OrderStatus.CONFIRMED, label: `Confirmed (${stats.confirmed})` },
          { key: OrderStatus.PREPARING, label: `Preparing (${stats.preparing})` },
          { key: OrderStatus.SERVED, label: `Served (${stats.served})` },
          { key: "ALL", label: `All Orders (${orders.length})` },
          { key: OrderStatus.COMPLETED, label: `Completed (${stats.completed})` },
          { key: OrderStatus.CANCELLED, label: `Cancelled (${stats.cancelled})` },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setStatusFilter(tab.key)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
              statusFilter === tab.key
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20 font-bold"
                : "bg-slate-900 text-slate-400 hover:text-white border border-slate-800"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Kanban Board View Mode */}
      {viewMode === "KANBAN" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 items-start">
          {/* Column 1: New / Submitted */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-amber-500/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-amber-300">
                  New Orders
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {orders.filter((o) => o.status === OrderStatus.SUBMITTED).length}
              </span>
            </div>

            <div className="space-y-3 min-h-[140px]">
              {orders
                .filter((o) => o.status === OrderStatus.SUBMITTED)
                .map((o) => renderOrderCard(o))}

              {orders.filter((o) => o.status === OrderStatus.SUBMITTED).length === 0 && (
                <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  No new orders waiting
                </div>
              )}
            </div>
          </div>

          {/* Column 2: Confirmed */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-blue-500/30">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-blue-300">
                  Confirmed
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {orders.filter((o) => o.status === OrderStatus.CONFIRMED).length}
              </span>
            </div>

            <div className="space-y-3 min-h-[140px]">
              {orders
                .filter((o) => o.status === OrderStatus.CONFIRMED)
                .map((o) => renderOrderCard(o))}

              {orders.filter((o) => o.status === OrderStatus.CONFIRMED).length === 0 && (
                <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  No orders awaiting kitchen start
                </div>
              )}
            </div>
          </div>

          {/* Column 3: In Kitchen / Preparing */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-purple-500/30">
              <div className="flex items-center gap-2">
                <ChefHat className="w-3.5 h-3.5 text-purple-400" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-purple-300">
                  Preparing
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-purple-500/20 text-purple-300 border border-purple-500/30">
                {orders.filter((o) => o.status === OrderStatus.PREPARING).length}
              </span>
            </div>

            <div className="space-y-3 min-h-[140px]">
              {orders
                .filter((o) => o.status === OrderStatus.PREPARING)
                .map((o) => renderOrderCard(o))}

              {orders.filter((o) => o.status === OrderStatus.PREPARING).length === 0 && (
                <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  Kitchen is clear
                </div>
              )}
            </div>
          </div>

          {/* Column 4: Ready / Served */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-emerald-500/30">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                <h2 className="text-xs font-extrabold uppercase tracking-wider text-emerald-300">
                  Served
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded-full text-xs font-bold font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {orders.filter((o) => o.status === OrderStatus.SERVED).length}
              </span>
            </div>

            <div className="space-y-3 min-h-[140px]">
              {orders
                .filter((o) => o.status === OrderStatus.SERVED)
                .map((o) => renderOrderCard(o))}

              {orders.filter((o) => o.status === OrderStatus.SERVED).length === 0 && (
                <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
                  No active served orders
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Queue / List View Mode (or Fallback when statusFilter is COMPLETED / CANCELLED) */}
      {(viewMode === "QUEUE" ||
        statusFilter === OrderStatus.COMPLETED ||
        statusFilter === OrderStatus.CANCELLED) && (
        <>
          {processedOrders.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
              <div className="w-12 h-12 rounded-xl bg-slate-900 text-slate-500 flex items-center justify-center mx-auto">
                <ShoppingBag className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-white">Kitchen Queue is Clear</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                {searchQuery
                  ? `No orders matching "${searchQuery}".`
                  : statusFilter === "ACTIVE"
                  ? "All active orders have been fulfilled! Ready for new orders."
                  : `No orders found with status "${statusFilter}".`}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {processedOrders.map((order) => renderOrderCard(order))}
            </div>
          )}
        </>
      )}

      {/* Safe Order Cancellation Confirmation Modal */}
      {cancelModalOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-md w-full glass-card rounded-3xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-400 flex items-center justify-center border border-rose-500/20">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Cancel Order Confirmation</h3>
                <p className="text-xs text-slate-400 font-mono">
                  Order #{cancelModalOrder.orderNumber}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to cancel this order? Once cancelled, the order is permanently
              marked as cancelled and excluded from kitchen fulfillment.
            </p>

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
              <button
                type="button"
                onClick={() => setCancelModalOrder(null)}
                disabled={actionLoadingId === cancelModalOrder.id}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => handleUpdateStatus(cancelModalOrder, OrderStatus.CANCELLED)}
                disabled={actionLoadingId === cancelModalOrder.id}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {actionLoadingId === cancelModalOrder.id && (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                )}
                <span>Confirm Cancellation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
