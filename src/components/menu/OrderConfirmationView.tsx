"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Clock,
  QrCode,
  Store,
  ChevronLeft,
  UtensilsCrossed,
  Receipt,
  AlertCircle,
  Printer,
  CreditCard,
  Lock,
  RefreshCw,
  X,
} from "lucide-react";
import { OrderStatus } from "@prisma/client";
import { CustomerOrderReceiptModal, CustomerReceiptData } from "./CustomerOrderReceiptModal";
import {
  CombinedBillReceiptModal,
  formatPaymentMethod,
} from "@/components/orders/CombinedBillReceiptModal";
import { CombinedSessionBillData } from "@/lib/orders/session-billing";

interface OrderConfirmationViewProps {
  order: CustomerReceiptData & {
    table?: { tableNumber?: string; name?: string | null; qrToken?: string | null } | null;
  };
  qrToken?: string | null;
  orderAccessToken?: string | null;
  initialCombinedBillData?: CombinedSessionBillData | null;
}

export function OrderConfirmationView({
  order,
  qrToken,
  orderAccessToken,
  initialCombinedBillData,
}: OrderConfirmationViewProps) {
  const [currentOrder, setCurrentOrder] = useState<CustomerReceiptData>(order);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [isCombinedBillOpen, setIsCombinedBillOpen] = useState(false);
  const [combinedBillData, setCombinedBillData] = useState<CombinedSessionBillData | null>(
    initialCombinedBillData || null
  );
  const [isFetchingBill, setIsFetchingBill] = useState(false);
  const [showOrderBreakdown, setShowOrderBreakdown] = useState(false);
  const [isPayConfirmModalOpen, setIsPayConfirmModalOpen] = useState(false);
  const [isSubmittingPayRequest, setIsSubmittingPayRequest] = useState(false);
  const [payRequestError, setPayRequestError] = useState<string | null>(null);
  const [payRequestSuccessNotice, setPayRequestSuccessNotice] = useState<string | null>(null);

  // Maintain active order and table session in browser storage for session-context access
  useEffect(() => {
    if (typeof window !== "undefined") {
      const effectiveQr = qrToken || order.table?.qrToken;
      const effectiveTableNumber = order.table?.tableNumber;

      if (effectiveTableNumber) {
        try {
          sessionStorage.setItem(
            `qrserve_table_${order.restaurant.slug}`,
            JSON.stringify({
              tableNumber: effectiveTableNumber,
              tableName: order.table?.name || null,
              qrToken: effectiveQr || null,
            })
          );
        } catch {
          // Ignore session storage errors
        }
      }

      if (orderAccessToken) {
        try {
          sessionStorage.setItem(
            `qrserve_active_order_${order.restaurant.slug}`,
            JSON.stringify({
              orderNumber: order.orderNumber,
              accessToken: orderAccessToken,
              tableNumber: effectiveTableNumber || null,
              qrToken: effectiveQr || null,
              confirmationUrl: `/r/${order.restaurant.slug}/orders/${order.orderNumber}?token=${orderAccessToken}${
                effectiveQr ? `&qr=${encodeURIComponent(effectiveQr)}` : effectiveTableNumber ? `&table=${encodeURIComponent(effectiveTableNumber)}` : ""
              }`,
              placedAt: order.createdAt,
            })
          );
        } catch {
          // Ignore session storage errors
        }
      }
    }
  }, [order, orderAccessToken, qrToken]);

  // Fetch combined table bill for session-level totals and consolidated receipt
  const fetchCombinedBill = useCallback(async () => {
    try {
      setIsFetchingBill(true);
      const param = order.orderNumber
        ? `orderNumber=${encodeURIComponent(order.orderNumber)}`
        : qrToken
        ? `qr=${encodeURIComponent(qrToken)}`
        : null;

      if (!param) return;
      const res = await fetch(`/api/r/${order.restaurant.slug}/bill?${param}`);
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setCombinedBillData(json.data);
        }
      }
    } catch {
      // non-fatal
    } finally {
      setIsFetchingBill(false);
    }
  }, [order.orderNumber, order.restaurant.slug, qrToken]);

  // Customer triggers "Pay & Get Final Bill"
  const handleRequestFinalBill = async () => {
    setIsSubmittingPayRequest(true);
    setPayRequestError(null);
    try {
      const res = await fetch(`/api/r/${order.restaurant.slug}/bill`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderNumber: order.orderNumber,
          qr: qrToken || order.table?.qrToken,
          table: order.table?.tableNumber,
          sessionId: combinedBillData?.sessionId,
        }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCombinedBillData(json.data);
        setPayRequestSuccessNotice(
          json.message || "Final bill requested successfully! Please proceed to the counter to pay."
        );
        setIsPayConfirmModalOpen(false);
      } else {
        setPayRequestError(json.error || "Failed to request final bill.");
      }
    } catch {
      setPayRequestError("Network error while requesting final bill. Please try again or notify staff.");
    } finally {
      setIsSubmittingPayRequest(false);
    }
  };

  useEffect(() => {
    if (!initialCombinedBillData) {
      fetchCombinedBill();
    }
  }, [fetchCombinedBill, initialCombinedBillData]);

  // Live polling for bill updates (e.g. counter payment confirmation or additional table orders)
  useEffect(() => {
    if (combinedBillData?.paymentStatus === "PAID") return;

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      fetchCombinedBill();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchCombinedBill, combinedBillData?.paymentStatus]);

  // Live polling for customer status changes (e.g. Submitted -> Confirmed -> Preparing -> Served)
  useEffect(() => {
    if (!orderAccessToken) return;
    if (
      currentOrder.status === OrderStatus.COMPLETED ||
      currentOrder.status === OrderStatus.CANCELLED
    ) {
      return;
    }

    const interval = setInterval(async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      try {
        const res = await fetch(
          `/api/r/${order.restaurant.slug}/orders/${order.orderNumber}?token=${encodeURIComponent(orderAccessToken)}`
        );
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            setCurrentOrder((prev) => ({
              ...prev,
              status: json.data.status,
            }));
            // Refresh combined bill status if completed
            if (json.data.status === OrderStatus.COMPLETED) {
              fetchCombinedBill();
            }
          }
        }
      } catch {
        // Silently continue polling on next interval
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [order.restaurant.slug, order.orderNumber, orderAccessToken, currentOrder.status, fetchCombinedBill]);

  const statusMeta: Record<
    OrderStatus,
    { label: string; bg: string; text: string; border: string; desc: string }
  > = {
    SUBMITTED: {
      label: "Order Placed",
      bg: "bg-amber-500/10",
      text: "text-amber-400",
      border: "border-amber-500/20",
      desc: "Your order has been sent to the restaurant counter. Please pay at the counter or show this screen to your server.",
    },
    CONFIRMED: {
      label: "Confirmed",
      bg: "bg-blue-500/10",
      text: "text-blue-400",
      border: "border-blue-500/20",
      desc: "The restaurant has confirmed your order.",
    },
    PREPARING: {
      label: "Preparing",
      bg: "bg-purple-500/10",
      text: "text-purple-400",
      border: "border-purple-500/20",
      desc: "The kitchen is actively preparing your dishes.",
    },
    SERVED: {
      label: "Served",
      bg: "bg-emerald-500/10",
      text: "text-emerald-400",
      border: "border-emerald-500/20",
      desc: "Your order has been served. Enjoy your meal!",
    },
    COMPLETED: {
      label: "Completed",
      bg: "bg-emerald-500/15",
      text: "text-emerald-300",
      border: "border-emerald-500/30",
      desc: "This order is complete. Thank you for dining with us!",
    },
    CANCELLED: {
      label: "Cancelled",
      bg: "bg-rose-500/10",
      text: "text-rose-400",
      border: "border-rose-500/20",
      desc: "This order was cancelled by the restaurant or customer.",
    },
  };

  const currentStatus = statusMeta[currentOrder.status] || statusMeta.SUBMITTED;
  const effectiveQrForNav = qrToken || order.table?.qrToken;
  const backToMenuUrl = effectiveQrForNav
    ? `/r/${order.restaurant.slug}?qr=${encodeURIComponent(effectiveQrForNav)}`
    : order.table?.tableNumber
    ? `/r/${order.restaurant.slug}?table=${encodeURIComponent(order.table.tableNumber)}`
    : `/r/${order.restaurant.slug}`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col py-8 px-4 sm:px-6">
      <div className="max-w-xl w-full mx-auto space-y-6">
        {/* Navigation link */}
        <div className="flex items-center justify-between no-print">
          <Link
            href={backToMenuUrl}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
          >
            <ChevronLeft className="w-4 h-4" />
            <span>Back to Menu</span>
          </Link>
          <span className="text-xs font-mono text-slate-500">QRServe Digital Receipt</span>
        </div>

        {/* Success Card Header */}
        <div className="glass-card rounded-3xl p-6 sm:p-8 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto border border-emerald-500/20 shadow-lg shadow-emerald-500/10">
            <CheckCircle2 className="w-8 h-8" />
          </div>

          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
              Order Placed Successfully!
            </h1>
            <p className="text-xs text-slate-400 mt-1">
              At <strong className="text-slate-200">{order.restaurant.name}</strong>
            </p>
          </div>

          {/* Big Order Number badge */}
          <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 flex flex-col items-center justify-center">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Your Order Number
            </span>
            <span className="text-2xl sm:text-3xl font-mono font-extrabold text-amber-400 tracking-wider mt-0.5">
              {order.orderNumber}
            </span>
            <div className="mt-2 flex items-center gap-2 flex-wrap justify-center text-xs">
              {order.table ? (
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <QrCode className="w-3.5 h-3.5" />
                  <span>
                    Table {order.table.tableNumber}
                    {order.table.name ? ` (${order.table.name})` : ""}
                  </span>
                </span>
              ) : (
                <span className="px-2.5 py-0.5 rounded-full font-bold bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" />
                  <span>Counter / Takeaway</span>
                </span>
              )}

              <span
                className={`px-2.5 py-0.5 rounded-full font-bold border ${currentStatus.bg} ${currentStatus.text} ${currentStatus.border}`}
              >
                {currentStatus.label}
              </span>
            </div>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed max-w-sm mx-auto">
            {currentStatus.desc}
          </p>
        </div>

        {/* Feedback / Notification on Requesting Final Bill */}
        {payRequestSuccessNotice && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center justify-between shadow-lg">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
              <span className="font-semibold">{payRequestSuccessNotice}</span>
            </div>
            <button
              type="button"
              onClick={() => setPayRequestSuccessNotice(null)}
              className="text-emerald-400/80 hover:text-emerald-200 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Counter-Only Payment Status Alert */}
        <div
          className={`p-5 rounded-3xl border-2 space-y-2 shadow-xl ${
            combinedBillData?.paymentStatus === "PAID"
              ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300 shadow-emerald-500/5"
              : combinedBillData?.isPaymentRequested
              ? "bg-rose-500/15 border-rose-500/50 text-rose-200 shadow-rose-500/10"
              : "bg-amber-500/15 border-amber-500/50 text-amber-200 shadow-amber-500/10"
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              {combinedBillData?.paymentStatus === "PAID" ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              ) : combinedBillData?.isPaymentRequested ? (
                <Receipt className="w-5 h-5 text-rose-400 animate-pulse flex-shrink-0" />
              ) : (
                <span className="w-3.5 h-3.5 rounded-full bg-amber-400 animate-ping flex-shrink-0" />
              )}
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide uppercase">
                {combinedBillData?.paymentStatus === "PAID"
                  ? "Payment Confirmed at Counter"
                  : combinedBillData?.isPaymentRequested
                  ? "Final Bill Requested — Pay at Counter"
                  : "Payment Pending — Please Pay at Counter."}
              </h2>
            </div>
            <span
              className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider border ${
                combinedBillData?.paymentStatus === "PAID"
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                  : combinedBillData?.isPaymentRequested
                  ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                  : "bg-amber-500/20 text-amber-300 border-amber-500/40"
              }`}
            >
              {combinedBillData?.paymentStatus === "PAID"
                ? "PAID"
                : combinedBillData?.isPaymentRequested
                ? "BILL REQUESTED"
                : "PENDING"}
            </span>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed">
            {combinedBillData?.paymentStatus === "PAID" ? (
              <>
                Your payment has been received and verified by restaurant staff. Receipt #
                <strong className="text-white font-mono">{combinedBillData.receiptNumber}</strong> (Paid via{" "}
                {formatPaymentMethod(combinedBillData.paymentMethod)}).
              </>
            ) : combinedBillData?.isPaymentRequested ? (
              <>
                Final bill requested for Table #{combinedBillData.table?.tableNumber || "your table"}. Please proceed to the billing counter to complete payment via <strong>Cash, UPI, or Card</strong>.
              </>
            ) : (
              <>
                All orders from your table are combined into one running bill. When you are ready to finish, click <strong>&ldquo;Pay & Get Final Bill&rdquo;</strong> below or visit the counter. Staff accepts <strong>Cash, UPI, or Card</strong>.
              </>
            )}
          </p>
        </div>

        {/* Primary Bill Presentation: Combined Table Running Bill */}
        {combinedBillData && combinedBillData.items.length > 0 ? (
          <div className="glass-card rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>
                  {combinedBillData.paymentStatus === "PAID"
                    ? `Table ${combinedBillData.table?.tableNumber || "Dine-In"} Final Receipt`
                    : combinedBillData.isPaymentRequested
                    ? `Table ${combinedBillData.table?.tableNumber || "Dine-In"} Final Bill (Payment Requested)`
                    : `Table ${combinedBillData.table?.tableNumber || "Dine-In"} Combined Running Bill`}
                </span>
              </div>
              <div className="text-xs text-amber-400 font-mono">
                {combinedBillData.orderCount}{" "}
                {combinedBillData.orderCount === 1 ? "Order" : "Orders"} Combined
              </div>
            </div>

            <div className="text-[11px] text-slate-400 flex items-center justify-between border-b border-slate-800/40 pb-2">
              <span>Session: <strong className="text-slate-200">{combinedBillData.sessionCode}</strong></span>
              <span className="truncate max-w-[200px]">
                {combinedBillData.orderNumbers.map((n: string) => `#${n}`).join(", ")}
              </span>
            </div>

            {/* Aggregated Items across all orders placed in this dining session */}
            <div className="divide-y divide-slate-800/60">
              {combinedBillData.items.map((item: any, idx: number) => (
                <div key={`${item.menuItemId}-${idx}`} className="py-2.5 flex items-start justify-between gap-3 text-xs">
                  <div className="flex-1">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[11px]">
                        {item.quantity}×
                      </span>
                      <span>{item.itemName}</span>
                    </div>
                    {item.taxRate > 0 && (
                      <p className="text-[10px] text-slate-500 pl-6 mt-0.5">
                        GST: {item.taxRate}%
                      </p>
                    )}
                    {item.notes && item.notes.length > 0 && (
                      <p className="text-[11px] text-amber-400/80 mt-0.5 italic pl-6">
                        ↳ {item.notes.join(" • ")}
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono font-bold text-slate-200">
                    ₹{item.subtotal.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {/* Combined Financial Breakdown */}
            <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Running Subtotal</span>
                <span className="font-mono">₹{combinedBillData.subtotal.toFixed(2)}</span>
              </div>

              {combinedBillData.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discounts Applied</span>
                  <span className="font-mono">-₹{combinedBillData.discountAmount.toFixed(2)}</span>
                </div>
              )}

              {combinedBillData.taxAmount > 0 && (
                <>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>CGST</span>
                    <span className="font-mono">₹{combinedBillData.cgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>SGST</span>
                    <span className="font-mono">₹{combinedBillData.sgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300 font-semibold">
                    <span>
                      Total GST {combinedBillData.taxMode === "INCLUSIVE" ? "(Included)" : ""}
                    </span>
                    <span className="font-mono">
                      {combinedBillData.taxMode === "INCLUSIVE" ? "" : "+"}₹{combinedBillData.taxAmount.toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
                <span>Final Payable Amount</span>
                <span className="font-mono text-xl font-extrabold text-amber-400">
                  ₹{combinedBillData.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Optional Accordion to view this specific order ticket */}
            {combinedBillData.orderCount > 1 && (
              <div className="pt-2 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => setShowOrderBreakdown((prev) => !prev)}
                  className="w-full py-2 text-left text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center justify-between transition cursor-pointer"
                >
                  <span>View Current Order #{order.orderNumber} details</span>
                  <span>{showOrderBreakdown ? "▲ Hide" : "▼ Show"}</span>
                </button>

                {showOrderBreakdown && (
                  <div className="mt-2 p-3 rounded-2xl bg-slate-900/90 border border-slate-800/80 space-y-2 text-xs">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Items in Order #{order.orderNumber}:
                    </p>
                    <div className="divide-y divide-slate-800/60">
                      {order.items.map((it) => (
                        <div key={it.id} className="py-1.5 flex justify-between text-xs">
                          <span className="text-slate-300">
                            {it.quantity}× {it.itemName}
                          </span>
                          <span className="font-mono text-slate-400">
                            ₹{it.subtotal.toFixed(2)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          /* Fallback Single Order Summary (e.g. for takeaway / counter orders) */
          <div className="glass-card rounded-3xl p-6 border border-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2 text-white font-bold text-sm">
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>Order Summary</span>
              </div>
              <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span suppressHydrationWarning>
                  {new Date(order.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </div>

            <div className="divide-y divide-slate-800/60">
              {order.items.map((item) => (
                <div key={item.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                  <div className="flex-1">
                    <div className="font-semibold text-white flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 font-mono font-bold text-[11px]">
                        {item.quantity}×
                      </span>
                      <span>{item.itemName}</span>
                    </div>
                    {item.notes && (
                      <p className="text-[11px] text-amber-400/80 mt-1 italic pl-6">
                        Note: &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                    <p className="text-slate-400 text-[11px] pl-6 mt-0.5">
                      ₹{item.unitPrice.toFixed(2)} each
                    </p>
                  </div>
                  <div className="text-right font-mono font-bold text-slate-200">
                    ₹{item.subtotal.toFixed(2)}
                  </div>
                </div>
              ))}
            </div>

            {order.customerNotes && (
              <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                <span className="font-semibold text-slate-400 block mb-0.5">Special Instructions:</span>
                <p className="text-slate-300 italic">&ldquo;{order.customerNotes}&rdquo;</p>
              </div>
            )}

            <div className="pt-3 border-t border-slate-800/80 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Items Subtotal</span>
                <span className="font-mono">₹{currentOrder.subtotal.toFixed(2)}</span>
              </div>

              {currentOrder.discountAmount !== undefined && currentOrder.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discount {currentOrder.couponCode ? `(${currentOrder.couponCode})` : ""}</span>
                  <span className="font-mono">-₹{currentOrder.discountAmount.toFixed(2)}</span>
                </div>
              )}

              {currentOrder.taxAmount !== undefined && currentOrder.taxAmount > 0 && (
                <div className="flex justify-between text-slate-300 font-semibold">
                  <span>Total GST ({currentOrder.taxRate}%)</span>
                  <span className="font-mono">+₹{currentOrder.taxAmount.toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
                <span>Total Amount</span>
                <span className="font-mono text-xl font-extrabold text-amber-400">
                  ₹{currentOrder.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-2 no-print">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Primary Action: Pay & Get Final Bill */}
            {order.table && combinedBillData && combinedBillData.paymentStatus !== "PAID" && !combinedBillData.isPaymentRequested && (
              <button
                type="button"
                id="pay-and-get-final-bill-btn"
                onClick={() => {
                  setPayRequestError(null);
                  setIsPayConfirmModalOpen(true);
                }}
                className="flex-1 py-3.5 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:from-amber-300 hover:to-orange-300 transition text-center shadow-lg shadow-amber-500/25 flex items-center justify-center gap-2 cursor-pointer ring-2 ring-amber-400/30 active:scale-95"
              >
                <CreditCard className="w-4 h-4" />
                <span>Pay & Get Final Bill</span>
              </button>
            )}

            {/* Action: If Final Bill has already been requested, direct to counter */}
            {order.table && combinedBillData?.isPaymentRequested && combinedBillData?.paymentStatus !== "PAID" && (
              <button
                type="button"
                id="pay-and-get-final-bill-btn"
                onClick={() => setIsCombinedBillOpen(true)}
                className="flex-1 py-3.5 px-4 rounded-xl font-bold text-xs text-rose-200 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 transition text-center shadow-lg shadow-rose-500/10 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Receipt className="w-4 h-4 text-rose-400" />
                <span>Final Bill Requested (Pay at Counter)</span>
              </button>
            )}

            {/* Action: If Payment Confirmed, View Consolidated Final Receipt */}
            {combinedBillData?.paymentStatus === "PAID" && (
              <button
                type="button"
                id="view-receipt-btn"
                onClick={() => setIsCombinedBillOpen(true)}
                className="flex-1 py-3.5 px-4 rounded-xl font-bold text-xs text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition text-center shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 text-emerald-300" />
                <span>View / Print Final Receipt</span>
              </button>
            )}

            {/* View Running Bill Button for Active Table Sessions */}
            {order.table && combinedBillData && combinedBillData.paymentStatus !== "PAID" && !combinedBillData.isPaymentRequested && (
              <button
                type="button"
                id="view-receipt-btn"
                onClick={() => setIsCombinedBillOpen(true)}
                className="py-3 px-3.5 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition text-center flex items-center justify-center gap-1.5 cursor-pointer"
                title="View running bill items"
              >
                <Receipt className="w-4 h-4 text-amber-400" />
                <span>View Bill</span>
              </button>
            )}

            {/* Fallback Single Order / Takeaway Receipt */}
            {(!order.table || !combinedBillData) && (
              <button
                type="button"
                id="view-receipt-btn"
                onClick={() => setIsReceiptModalOpen(true)}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition text-center shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                <span>View Detailed Receipt</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => window.print()}
              className="py-3 px-4 rounded-xl font-semibold text-xs text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition text-center flex items-center justify-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-slate-400" />
              <span>Print</span>
            </button>

            <Link
              href={backToMenuUrl}
              className={`py-3 px-4 rounded-xl font-semibold text-xs transition text-center flex items-center justify-center gap-2 cursor-pointer ${
                combinedBillData?.isPaymentRequested && combinedBillData?.paymentStatus !== "PAID"
                  ? "text-slate-400 bg-slate-900/40 border border-slate-800/60 hover:text-slate-200"
                  : "text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800"
              }`}
            >
              <UtensilsCrossed className="w-4 h-4 text-amber-400" />
              <span>Order More Items</span>
            </Link>
          </div>

          {combinedBillData?.isPaymentRequested && combinedBillData?.paymentStatus !== "PAID" && (
            <p className="text-[11px] text-amber-400/80 text-center italic">
              Bill locked for counter payment. Please ask restaurant staff if you need to reopen your bill to order more items.
            </p>
          )}
        </div>
      </div>

      {/* Pay & Get Final Bill Confirmation Modal */}
      {isPayConfirmModalOpen && combinedBillData && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-lg w-full p-6 sm:p-7 shadow-2xl relative space-y-5">
            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                if (!isSubmittingPayRequest) {
                  setIsPayConfirmModalOpen(false);
                  setPayRequestError(null);
                }
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Modal Header */}
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Pay & Request Final Bill</h3>
                <p className="text-xs text-slate-400">
                  Table {combinedBillData.table?.tableNumber || "Dine-In"} • {combinedBillData.orderCount}{" "}
                  {combinedBillData.orderCount === 1 ? "order" : "orders"} combined
                </p>
              </div>
            </div>

            {/* Explanatory Notice */}
            <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-amber-300">
                <Lock className="w-3.5 h-3.5" />
                <span>Finalizing Table Bill</span>
              </div>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Clicking confirm will finalize your table bill and notify restaurant staff to prepare your counter payment. Further orders from this table will be locked until settled.
              </p>
            </div>

            {/* Authoritative Financial Breakdown calculated by Server */}
            <div className="rounded-2xl bg-slate-950/80 border border-slate-800/80 p-4 space-y-2 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Orders Included</span>
                <span className="font-mono text-slate-200 font-semibold truncate max-w-[200px]">
                  {combinedBillData.orderNumbers.map((n: string) => `#${n}`).join(", ")}
                </span>
              </div>

              <div className="flex justify-between text-slate-400 pt-1 border-t border-slate-800/50">
                <span>Combined Subtotal</span>
                <span className="font-mono text-slate-200 font-semibold">₹{combinedBillData.subtotal.toFixed(2)}</span>
              </div>

              {combinedBillData.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discounts Applied</span>
                  <span className="font-mono">-₹{combinedBillData.discountAmount.toFixed(2)}</span>
                </div>
              )}

              {combinedBillData.taxAmount > 0 && (
                <>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>CGST</span>
                    <span className="font-mono">₹{combinedBillData.cgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-400 text-[11px]">
                    <span>SGST</span>
                    <span className="font-mono">₹{combinedBillData.sgstAmount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-slate-300 font-semibold">
                    <span>
                      Total GST {combinedBillData.taxMode === "INCLUSIVE" ? "(Included)" : ""}
                    </span>
                    <span className="font-mono">
                      {combinedBillData.taxMode === "INCLUSIVE" ? "" : "+"}₹{combinedBillData.taxAmount.toFixed(2)}
                    </span>
                  </div>
                </>
              )}

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
                <span className="text-slate-300">Final Payable Total</span>
                <span className="font-mono text-xl font-extrabold text-amber-400">
                  ₹{combinedBillData.totalAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Error Message if any */}
            {payRequestError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
                <span>{payRequestError}</span>
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsPayConfirmModalOpen(false);
                  setPayRequestError(null);
                }}
                disabled={isSubmittingPayRequest}
                className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                Keep Ordering
              </button>
              <button
                type="button"
                id="confirm-pay-request-btn"
                onClick={handleRequestFinalBill}
                disabled={isSubmittingPayRequest}
                className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-400 hover:from-amber-300 hover:to-orange-300 transition flex items-center gap-2 cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50"
              >
                {isSubmittingPayRequest ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Finalizing Bill...</span>
                  </>
                ) : (
                  <>
                    <Receipt className="w-3.5 h-3.5" />
                    <span>Confirm & Request Final Bill</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer Receipt Slip Modal (Single Order) */}
      <CustomerOrderReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={currentOrder}
      />

      {/* Table Combined Bill / Final Consolidated Receipt Modal */}
      <CombinedBillReceiptModal
        isOpen={isCombinedBillOpen}
        onClose={() => setIsCombinedBillOpen(false)}
        billData={combinedBillData}
        isLoading={isFetchingBill}
        isStaffMode={false}
      />
    </div>
  );
}
