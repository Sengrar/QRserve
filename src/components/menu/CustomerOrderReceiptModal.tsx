"use client";

import React from "react";
import Link from "next/link";
import {
  X,
  Printer,
  Receipt,
  Store,
  AlertCircle,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { OrderStatus, TaxCalculationMode } from "@prisma/client";

export interface CustomerReceiptData {
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  customerNotes?: string | null;
  subtotal: number;
  discountAmount?: number;
  couponCode?: string | null;
  taxRate?: number;
  taxAmount?: number;
  taxMode?: TaxCalculationMode;
  taxableAmount?: number;
  cgstAmount?: number;
  sgstAmount?: number;
  totalAmount: number;
  table: { tableNumber: string; name: string | null } | null;
  restaurant: {
    name: string;
    slug: string;
    phone: string | null;
    address: string | null;
    gstEnabled?: boolean;
    gstin?: string | null;
    legalName?: string | null;
    taxRate?: number;
    taxMode?: TaxCalculationMode;
  };
  items: Array<{
    id: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    taxRate?: number;
    taxAmount?: number;
    taxableAmount?: number;
    notes?: string | null;
  }>;
}

interface CustomerOrderReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: CustomerReceiptData | null;
  isLoading?: boolean;
  error?: string | null;
  fullOrderUrl?: string | null;
}

export function CustomerOrderReceiptModal({
  isOpen,
  onClose,
  order,
  isLoading = false,
  error = null,
  fullOrderUrl,
}: CustomerOrderReceiptModalProps) {
  if (!isOpen) return null;

  function handlePrint() {
    window.print();
  }

  const itemRateBuckets: Array<{
    rate: number;
    taxableAmount: number;
    taxAmount: number;
  }> = [];

  if (order?.items && order.taxAmount && order.taxAmount > 0) {
    const buckets = new Map<
      string,
      { rate: number; taxableAmount: number; taxAmount: number }
    >();
    let hasItemTax = false;
    for (const item of order.items) {
      if (
        item.taxRate !== undefined &&
        item.taxAmount !== undefined &&
        item.taxAmount > 0
      ) {
        hasItemTax = true;
        const key = item.taxRate.toFixed(2);
        const b = buckets.get(key) || {
          rate: item.taxRate,
          taxableAmount: 0,
          taxAmount: 0,
        };
        b.taxableAmount += item.taxableAmount ?? item.subtotal;
        b.taxAmount += item.taxAmount;
        buckets.set(key, b);
      }
    }
    if (hasItemTax) {
      itemRateBuckets.push(
        ...Array.from(buckets.values()).sort((a, b) => a.rate - b.rate)
      );
    }
  }

  const statusLabels: Record<OrderStatus, { label: string; color: string }> = {
    SUBMITTED: { label: "Order Placed", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
    CONFIRMED: { label: "Confirmed", color: "bg-blue-500/20 text-blue-300 border-blue-500/30" },
    PREPARING: { label: "Preparing", color: "bg-purple-500/20 text-purple-300 border-purple-500/30" },
    SERVED: { label: "Served", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    COMPLETED: { label: "Completed", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
    CANCELLED: { label: "Cancelled", color: "bg-rose-500/20 text-rose-300 border-rose-500/30" },
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-dialog-title"
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4"
    >
      <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 my-8">
        {/* Top Header Actions (non-printable) */}
        <div className="flex items-center justify-between no-print">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-amber-400" />
            <h2 id="receipt-dialog-title" className="text-sm font-bold text-white tracking-wide">
              Official Customer Receipt
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            {order && (
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition cursor-pointer"
                title="Print Receipt"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              title="Close Receipt"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="py-16 text-center space-y-3">
            <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
            <p className="text-xs text-slate-400 font-medium">
              Fetching authoritative receipt data from server...
            </p>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs space-y-2 text-center">
            <AlertCircle className="w-6 h-6 text-rose-400 mx-auto" />
            <p className="font-semibold">Unable to Load Receipt</p>
            <p className="text-slate-400">{error}</p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-1.5 rounded-lg bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* The Printable Receipt Card */}
        {!isLoading && !error && order && (
          <div
            id="printable-receipt"
            className="printable-receipt-card rounded-2xl bg-slate-950 p-5 sm:p-6 border border-slate-800/80 shadow-inner font-mono text-xs space-y-4"
          >
            {/* Restaurant Info Header */}
            <div className="text-center space-y-1">
              <div className="inline-flex p-2 rounded-xl bg-amber-400/10 text-amber-400 mb-1">
                <Store className="w-6 h-6" />
              </div>
              <h3 className="text-base sm:text-lg font-black tracking-tight text-white uppercase font-sans">
                {order.restaurant.name}
              </h3>
              {order.restaurant.legalName && order.restaurant.legalName !== order.restaurant.name && (
                <p className="text-[11px] text-slate-300 font-sans font-medium">
                  {order.restaurant.legalName}
                </p>
              )}
              {order.restaurant.address && (
                <p className="text-[11px] text-slate-400 font-sans">{order.restaurant.address}</p>
              )}
              {order.restaurant.phone && (
                <p className="text-[11px] text-slate-500">Tel: {order.restaurant.phone}</p>
              )}
              {order.restaurant.gstin && (
                <p className="text-[11px] text-amber-300 font-mono font-bold tracking-wider pt-0.5">
                  GSTIN: {order.restaurant.gstin}
                </p>
              )}
              <div className="pt-1">
                <span className="text-[10px] tracking-widest uppercase font-bold text-amber-400/90 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  {order.taxRate && order.taxRate > 0 && order.restaurant.gstin
                    ? "Tax Invoice / Official Receipt"
                    : "Customer Order Receipt"}
                </span>
              </div>
            </div>

            {/* Receipt Meta (Order ID, Table, Date/Time, Status) */}
            <div className="border-t border-dashed border-slate-800 pt-3 space-y-1.5 text-[11px]">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Order Ref:</span>
                <span className="font-bold text-amber-300 tracking-wider">{order.orderNumber}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Date & Time:</span>
                <span className="text-slate-200" suppressHydrationWarning>
                  {new Date(order.createdAt).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}{" "}
                  {new Date(order.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Table Context:</span>
                <span className="font-bold text-slate-200">
                  {order.table ? (
                    `Table ${order.table.tableNumber}${order.table.name ? ` (${order.table.name})` : ""}`
                  ) : (
                    "Counter / Takeaway"
                  )}
                </span>
              </div>
              <div className="flex justify-between items-center pt-0.5">
                <span className="text-slate-400">Current Status:</span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    statusLabels[order.status]?.color || "bg-slate-800 text-slate-300"
                  }`}
                >
                  {statusLabels[order.status]?.label || order.status}
                </span>
              </div>
            </div>

            {/* Line Items Table */}
            <div className="border-t border-dashed border-slate-800 pt-3 space-y-2">
              <div className="grid grid-cols-12 text-[10px] uppercase font-bold text-slate-400 pb-1 border-b border-slate-800/60 font-sans">
                <div className="col-span-6">Item</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Price</div>
                <div className="col-span-2 text-right">Subtotal</div>
              </div>

              <div className="divide-y divide-slate-900 space-y-1">
                {order.items.map((item) => (
                  <div key={item.id} className="pt-1.5 pb-1">
                    <div className="grid grid-cols-12 items-baseline text-[11px]">
                      <div className="col-span-6 font-semibold text-white font-sans truncate pr-1 flex items-center gap-1.5 flex-wrap">
                        <span>{item.itemName}</span>
                        {item.taxRate !== undefined &&
                          item.taxRate > 0 &&
                          itemRateBuckets.length > 1 && (
                            <span className="text-[9px] px-1 py-0.2 rounded font-mono font-normal bg-purple-500/20 text-purple-300 border border-purple-500/30">
                              {item.taxRate}%
                            </span>
                          )}
                      </div>
                      <div className="col-span-2 text-center text-slate-300 font-mono">
                        {item.quantity}×
                      </div>
                      <div className="col-span-2 text-right text-slate-400 font-mono">
                        ₹{item.unitPrice.toFixed(2)}
                      </div>
                      <div className="col-span-2 text-right font-bold text-slate-200 font-mono">
                        ₹{item.subtotal.toFixed(2)}
                      </div>
                    </div>
                    {item.notes && (
                      <p className="text-[10px] text-amber-400/80 italic font-sans pl-1 mt-0.5">
                        Note: &ldquo;{item.notes}&rdquo;
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Special Instructions (if present) */}
            {order.customerNotes && (
              <div className="border-t border-dashed border-slate-800 pt-2.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-0.5 font-sans">
                  Order Instructions:
                </span>
                <p className="text-[11px] text-amber-300/90 italic font-sans bg-slate-900/80 p-2 rounded-lg border border-slate-800">
                  &ldquo;{order.customerNotes}&rdquo;
                </p>
              </div>
            )}

            {/* Authoritative Financial Totals */}
            <div className="border-t border-dashed border-slate-800 pt-3 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between text-slate-400">
                <span>Items Subtotal:</span>
                <span>₹{order.subtotal.toFixed(2)}</span>
              </div>

              {order.discountAmount !== undefined && order.discountAmount > 0 && (
                <div className="flex justify-between text-emerald-400 font-semibold">
                  <span>Discount {order.couponCode ? `(${order.couponCode})` : ""}:</span>
                  <span>-₹{order.discountAmount.toFixed(2)}</span>
                </div>
              )}

              {order.taxRate && order.taxRate > 0 && order.taxAmount !== undefined && order.taxAmount > 0 ? (
                <>
                  {order.taxMode === "INCLUSIVE" ? (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Taxable Value:</span>
                        <span>₹{(order.taxableAmount ?? (order.totalAmount - (order.taxAmount || 0))).toFixed(2)}</span>
                      </div>
                      {itemRateBuckets.length > 1 ? (
                        <>
                          {itemRateBuckets.map((b) => (
                            <div key={b.rate} className="flex justify-between text-slate-400">
                              <span>GST ({b.rate}%):</span>
                              <span>₹{b.taxAmount.toFixed(2)}</span>
                            </div>
                          ))}
                        </>
                      ) : null}
                      <div className="flex justify-between text-slate-400">
                        <span>CGST (50%):</span>
                        <span>₹{(order.cgstAmount ?? ((order.taxAmount || 0) / 2)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>SGST (50%):</span>
                        <span>₹{(order.sgstAmount ?? ((order.taxAmount || 0) / 2)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-300/90 text-[11px] italic font-sans">
                        <span>Pricing Mode:</span>
                        <span>
                          Prices inclusive of GST
                          {itemRateBuckets.length > 1
                            ? " (mixed item rates)"
                            : ` (${order.taxRate}%)`}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex justify-between text-slate-400">
                        <span>Taxable Amount:</span>
                        <span>₹{(order.taxableAmount ?? order.subtotal).toFixed(2)}</span>
                      </div>
                      {itemRateBuckets.length > 1 ? (
                        <>
                          {itemRateBuckets.map((b) => (
                            <div key={b.rate} className="flex justify-between text-slate-400">
                              <span>GST ({b.rate}%):</span>
                              <span>₹{b.taxAmount.toFixed(2)}</span>
                            </div>
                          ))}
                        </>
                      ) : null}
                      <div className="flex justify-between text-slate-400">
                        <span>CGST (50%):</span>
                        <span>₹{(order.cgstAmount ?? ((order.taxAmount || 0) / 2)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>SGST (50%):</span>
                        <span>₹{(order.sgstAmount ?? ((order.taxAmount || 0) / 2)).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-slate-300 font-semibold">
                        <span>
                          Total GST
                          {itemRateBuckets.length > 1
                            ? " (mixed rates)"
                            : ` (${order.taxRate}%)`}:
                        </span>
                        <span>+₹{(order.taxAmount || 0).toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-amber-300/90 text-[11px] italic font-sans">
                        <span>Pricing Mode:</span>
                        <span>Prices exclusive of tax</span>
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="flex justify-between text-slate-500 text-[11px]">
                  <span>Taxes & Service:</span>
                  <span>{order.restaurant.gstEnabled ? "0.00% GST" : "Included in prices"}</span>
                </div>
              )}

              <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-extrabold text-white">
                <span className="font-sans uppercase tracking-wide">Grand Total:</span>
                <span className="text-lg text-amber-400">₹{order.totalAmount.toFixed(2)}</span>
              </div>
            </div>

            {/* Payment & In-store Instructions */}
            <div className="border-t border-dashed border-slate-800 pt-3 text-center space-y-1">
              <span className="inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20 font-sans">
                Pay at Restaurant Counter
              </span>
              <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                Please present your Order Number (<strong>{order.orderNumber}</strong>) or show this receipt
                at the counter when making payment.
              </p>
            </div>

            {/* Receipt Footer */}
            <div className="border-t border-slate-900 pt-2 text-center text-[10px] text-slate-500 font-sans">
              <p>Thank you for dining with us!</p>
              <p className="text-[9px] text-slate-600 mt-0.5">Powered by QRServe Digital Dining</p>
            </div>
          </div>
        )}

        {/* Modal Action Buttons (non-printable) */}
        {!isLoading && !error && order && (
          <div className="flex flex-col sm:flex-row gap-2.5 pt-2 no-print">
            <button
              type="button"
              onClick={handlePrint}
              className="flex-1 py-2.5 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print Receipt</span>
            </button>

            {fullOrderUrl && (
              <Link
                href={fullOrderUrl}
                onClick={onClose}
                className="py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 transition flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                <span>Full Status Screen</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </Link>
            )}

            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-400 hover:text-white bg-slate-900 hover:bg-slate-800 border border-slate-800 transition cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
