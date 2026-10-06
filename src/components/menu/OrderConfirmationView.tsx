"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import { OrderStatus } from "@prisma/client";
import { CustomerOrderReceiptModal, CustomerReceiptData } from "./CustomerOrderReceiptModal";

interface OrderConfirmationViewProps {
  order: CustomerReceiptData;
  qrToken?: string | null;
  orderAccessToken?: string | null;
}

export function OrderConfirmationView({
  order,
  qrToken,
  orderAccessToken,
}: OrderConfirmationViewProps) {
  const [currentOrder, setCurrentOrder] = useState<CustomerReceiptData>(order);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Maintain order session in browser storage for session-context receipt access
  useEffect(() => {
    if (typeof window !== "undefined" && orderAccessToken) {
      try {
        sessionStorage.setItem(
          `qrserve_active_order_${order.restaurant.slug}`,
          JSON.stringify({
            orderNumber: order.orderNumber,
            accessToken: orderAccessToken,
            confirmationUrl: `/r/${order.restaurant.slug}/orders/${order.orderNumber}?token=${orderAccessToken}`,
            placedAt: order.createdAt,
          })
        );
      } catch {
        // Ignore session storage errors
      }
    }
  }, [order, orderAccessToken]);

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
          }
        }
      } catch {
        // Silently continue polling on next interval
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [order.restaurant.slug, order.orderNumber, orderAccessToken, currentOrder.status]);

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
  const backToMenuUrl = `/r/${order.restaurant.slug}${qrToken ? `?qr=${encodeURIComponent(qrToken)}` : ""}`;

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

        {/* Order Details Breakdown */}
        <div className="glass-card rounded-3xl p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2 text-white font-bold text-sm">
              <Receipt className="w-4 h-4 text-amber-400" />
              <span>Order Summary</span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-1 font-mono">
              <Clock className="w-3.5 h-3.5 text-slate-500" />
              <span suppressHydrationWarning>
                {new Date(order.createdAt).toLocaleDateString(undefined, {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}{" "}
                •{" "}
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

          {/* Pricing Totals */}
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

            {currentOrder.taxRate && currentOrder.taxRate > 0 && currentOrder.taxAmount !== undefined && currentOrder.taxAmount > 0 ? (
              <>
                {currentOrder.taxMode === "INCLUSIVE" ? (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>Taxable Value</span>
                      <span className="font-mono">
                        ₹{(currentOrder.taxableAmount ?? (currentOrder.totalAmount - (currentOrder.taxAmount || 0))).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>CGST ({((currentOrder.taxRate || 0) / 2).toFixed(1)}%)</span>
                      <span className="font-mono">
                        ₹{(currentOrder.cgstAmount ?? ((currentOrder.taxAmount || 0) / 2)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>SGST ({((currentOrder.taxRate || 0) / 2).toFixed(1)}%)</span>
                      <span className="font-mono">
                        ₹{(currentOrder.sgstAmount ?? ((currentOrder.taxAmount || 0) / 2)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-amber-300/80 text-[11px] italic">
                      <span>Tax Treatment</span>
                      <span>Prices inclusive of {currentOrder.taxRate}% GST</span>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex justify-between text-slate-400">
                      <span>CGST ({((currentOrder.taxRate || 0) / 2).toFixed(1)}%)</span>
                      <span className="font-mono">
                        ₹{(currentOrder.cgstAmount ?? ((currentOrder.taxAmount || 0) / 2)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>SGST ({((currentOrder.taxRate || 0) / 2).toFixed(1)}%)</span>
                      <span className="font-mono">
                        ₹{(currentOrder.sgstAmount ?? ((currentOrder.taxAmount || 0) / 2)).toFixed(2)}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-300 font-semibold">
                      <span>Total GST ({currentOrder.taxRate}%)</span>
                      <span className="font-mono">+₹{(currentOrder.taxAmount || 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-amber-300/80 text-[11px] italic">
                      <span>Tax Treatment</span>
                      <span>Prices exclusive of tax</span>
                    </div>
                  </>
                )}
              </>
            ) : null}

            <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
              <span>Total Amount</span>
              <span className="font-mono text-xl font-extrabold text-amber-400">
                ₹{currentOrder.totalAmount.toFixed(2)}
              </span>
            </div>
          </div>
        </div>

        {/* Clear Next Action for Customer */}
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200 flex items-start gap-3">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-300">Next Steps:</p>
            <p className="text-slate-300 leading-relaxed">
              Show this order confirmation or your order number (<strong>{order.orderNumber}</strong>)
              at the restaurant billing counter. Payment is collected directly at the counter.
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 no-print">
          <button
            type="button"
            id="view-receipt-btn"
            onClick={() => setIsReceiptModalOpen(true)}
            className="flex-1 py-3 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition text-center shadow-lg shadow-amber-500/15 flex items-center justify-center gap-2 cursor-pointer"
          >
            <Receipt className="w-4 h-4" />
            <span>View Receipt</span>
          </button>

          <button
            type="button"
            onClick={() => window.print()}
            className="py-3 px-4 rounded-xl font-semibold text-xs text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 transition text-center flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4 h-4 text-slate-400" />
            <span>Print Receipt</span>
          </button>

          <Link
            href={backToMenuUrl}
            className="py-3 px-4 rounded-xl font-semibold text-xs text-slate-300 hover:text-white bg-slate-900/60 hover:bg-slate-800 border border-slate-800 transition text-center flex items-center justify-center gap-2 cursor-pointer"
          >
            <UtensilsCrossed className="w-4 h-4 text-amber-400" />
            <span>Order More Items</span>
          </Link>
        </div>
      </div>

      {/* Customer Receipt Slip Modal */}
      <CustomerOrderReceiptModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        order={currentOrder}
      />
    </div>
  );
}
