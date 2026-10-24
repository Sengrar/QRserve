"use client";

import React, { useState } from "react";
import {
  X,
  Printer,
  Receipt,
  Store,
  CheckCircle2,
  AlertCircle,
  CreditCard,
  Banknote,
  Smartphone,
  Loader2,
} from "lucide-react";
import { CombinedSessionBillData } from "@/lib/orders/session-billing";

export function formatPaymentMethod(method?: string | null): string {
  if (!method) return "Counter";
  const m = method.toUpperCase();
  if (m === "CASH" || m === "COUNTER_CASH") return "Cash";
  if (m === "UPI" || m === "COUNTER_UPI") return "UPI";
  if (m === "CARD") return "Card";
  return method;
}

interface CombinedBillReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  billData: CombinedSessionBillData | null;
  isLoading?: boolean;
  error?: string | null;
  /**
   * If true, shows staff counter payment confirmation controls
   */
  isStaffMode?: boolean;
  onConfirmPayment?: (paymentMethod: string, notes?: string) => Promise<void>;
  isProcessingPayment?: boolean;
  onReopenBill?: () => Promise<void>;
  isReopeningBill?: boolean;
}

export function CombinedBillReceiptModal({
  isOpen,
  onClose,
  billData,
  isLoading = false,
  error = null,
  isStaffMode = false,
  onConfirmPayment,
  isProcessingPayment = false,
  onReopenBill,
  isReopeningBill = false,
}: CombinedBillReceiptModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("CASH");
  const [staffNotes, setStaffNotes] = useState<string>("");

  if (!isOpen) return null;

  const isPaid = billData?.paymentStatus === "PAID";
  const isPaymentRequested =
    !isPaid &&
    (billData?.isPaymentRequested ||
      billData?.status === "PAYMENT_REQUESTED" ||
      billData?.sessionStatus === "PAYMENT_REQUESTED");

  const handlePrint = () => {
    window.print();
  };

  const handlePaymentSubmit = async () => {
    if (!onConfirmPayment) return;
    await onConfirmPayment(selectedMethod, staffNotes);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="combined-bill-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90 no-print">
          <div className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                isPaid
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : isPaymentRequested
                  ? "bg-orange-500/10 text-orange-400 border border-orange-500/20"
                  : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
              }`}
            >
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h2
                id="combined-bill-modal-title"
                className="text-sm font-bold text-white flex items-center gap-2"
              >
                <span>
                  {isPaid
                    ? "Consolidated Final Receipt"
                    : isPaymentRequested
                    ? "Final Table Bill"
                    : "Running Table Bill"}
                </span>
                {billData && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${
                      isPaid
                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                        : isPaymentRequested
                        ? "bg-orange-500/20 text-orange-300 border-orange-500/40 animate-pulse"
                        : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                    }`}
                  >
                    {isPaid ? "PAID" : isPaymentRequested ? "PAYMENT REQUESTED" : "PENDING"}
                  </span>
                )}
              </h2>
              {billData && (
                <p className="text-[11px] text-slate-400">
                  Table {billData.table?.tableNumber || "Dine-In"} • Session {billData.sessionCode}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {billData && (
              <button
                type="button"
                onClick={handlePrint}
                className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
                title="Print Receipt"
              >
                <Printer className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
              aria-label="Close bill modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Receipt Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading && (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin" />
              <p className="text-xs text-slate-400 font-medium">Fetching table bill...</p>
            </div>
          )}

          {error && !isLoading && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Error loading bill</p>
                <p className="text-slate-300 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && !error && !billData && (
            <div className="py-12 text-center text-slate-400 text-xs">
              No active bill found for this table.
            </div>
          )}

          {!isLoading && !error && billData && (
            <>
              {/* Status Alert Banner */}
              {isPaymentRequested && !isPaid && (
                <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-xs flex items-start justify-between gap-3 shadow-lg no-print">
                  <div className="flex items-start gap-2.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-white text-xs">
                        {isStaffMode ? "Customer Requested Final Bill" : "Final Bill Requested — Pay at Counter"}
                      </p>
                      <p className="text-[11px] text-amber-300/80 mt-0.5 leading-relaxed">
                        {isStaffMode
                          ? "Table bill is locked for settlement. Verify totals and record counter payment below."
                          : `Please proceed to the restaurant billing counter to pay ₹${billData.totalAmount.toFixed(2)} via Cash, UPI, or Card.`}
                      </p>
                    </div>
                  </div>
                  {isStaffMode && onReopenBill && (
                    <button
                      type="button"
                      onClick={onReopenBill}
                      disabled={isReopeningBill || isProcessingPayment}
                      className="px-3 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer flex-shrink-0"
                    >
                      {isReopeningBill ? "Reopening..." : "Reopen Bill"}
                    </button>
                  )}
                </div>
              )}

              {isPaid && (
                <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-3 no-print">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <div>
                    <p className="font-bold text-white">Payment Confirmed & Settled</p>
                    <p className="text-[11px] text-emerald-300/90 mt-0.5">
                      Receipt #{billData.receiptNumber} • Paid via {formatPaymentMethod(billData.paymentMethod)}
                    </p>
                  </div>
                </div>
              )}

              <div className="receipt-content bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-5 font-mono text-xs text-slate-300 shadow-inner">
              {/* Restaurant Brand Header */}
              <div className="text-center pb-4 border-b border-dashed border-slate-800 space-y-1">
                <h3 className="text-base font-bold text-white tracking-wider">
                  {billData.restaurant.legalName || billData.restaurant.name}
                </h3>
                {billData.restaurant.gstEnabled && billData.restaurant.gstin && (
                  <p className="text-[11px] text-slate-400">
                    GSTIN: <span className="text-slate-200 font-bold">{billData.restaurant.gstin}</span>
                  </p>
                )}
                <div className="flex items-center justify-center gap-2 text-[10px] text-amber-400 uppercase tracking-widest pt-1">
                  <span>{isPaid ? "FINAL CONSOLIDATED TAX INVOICE" : "TABLE RUNNING BILL"}</span>
                </div>
              </div>

              {/* Session & Table Meta */}
              <div className="grid grid-cols-2 gap-2 text-[11px] pb-4 border-b border-dashed border-slate-800">
                <div>
                  <span className="text-slate-500 block">TABLE:</span>
                  <span className="text-white font-bold text-sm">
                    #{billData.table?.tableNumber || "N/A"}{" "}
                    {billData.table?.name ? `(${billData.table.name})` : ""}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-slate-500 block">SESSION:</span>
                  <span className="text-amber-400 font-bold">{billData.sessionCode}</span>
                </div>

                <div>
                  <span className="text-slate-500 block">ORDERS COMBINED:</span>
                  <span className="text-slate-200">
                    {billData.orderCount} {billData.orderCount === 1 ? "order" : "orders"}
                  </span>
                  <div className="text-[10px] text-slate-400 truncate">
                    {(billData.orderNumbers || []).map((num: string) => `#${num}`).join(", ")}
                  </div>
                </div>

                <div className="text-right">
                  <span className="text-slate-500 block">
                    {isPaid ? "RECEIPT NUMBER:" : "STATUS:"}
                  </span>
                  {isPaid ? (
                    <span className="text-emerald-400 font-bold text-xs">
                      {billData.receiptNumber || "N/A"}
                    </span>
                  ) : (
                    <span className="text-amber-400 font-bold">PAYMENT PENDING</span>
                  )}
                </div>

                {isPaid && billData.paidAt && (
                  <div className="col-span-2 pt-1 border-t border-slate-800/40 text-[10px] text-slate-400 flex justify-between">
                    <span>Paid via {formatPaymentMethod(billData.paymentMethod)}</span>
                    <span>{new Date(billData.paidAt).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Combined Itemized Table */}
              <div className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold text-slate-400 border-b border-slate-800 pb-1 uppercase tracking-wider">
                  <span className="w-12">Qty</span>
                  <span className="flex-1">Item Description</span>
                  <span className="w-16 text-right">Price</span>
                  <span className="w-20 text-right">Total</span>
                </div>

                <div className="divide-y divide-slate-800/50">
                  {(billData.items || []).map((item: any, idx: number) => (
                    <div key={`${item.menuItemId}-${idx}`} className="py-2 flex items-start text-xs">
                      <span className="w-12 font-bold text-amber-400">{item.quantity}×</span>
                      <div className="flex-1 min-w-0 pr-2">
                        <span className="font-semibold text-white block truncate">{item.itemName}</span>
                        {(item.taxRate ?? 0) > 0 && (
                          <span className="text-[10px] text-slate-400 block">
                            (incl. {item.taxRate}% GST)
                          </span>
                        )}
                        {Array.isArray(item.notes) && item.notes.length > 0 && (
                          <span className="text-[10px] text-amber-300/80 block italic">
                            ↳ {item.notes.join(" • ")}
                          </span>
                        )}
                      </div>
                      <span className="w-16 text-right text-slate-400">
                        ₹{(item.unitPrice ?? 0).toFixed(2)}
                      </span>
                      <span className="w-20 text-right font-bold text-slate-200">
                        ₹{(item.subtotal ?? 0).toFixed(2)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Financial Totals & Tax Breakdown */}
              <div className="pt-3 border-t border-dashed border-slate-800 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-400">
                  <span>Subtotal</span>
                  <span>₹{(billData.subtotal ?? 0).toFixed(2)}</span>
                </div>

                {(billData.discountAmount ?? 0) > 0 && (
                  <div className="flex justify-between text-emerald-400">
                    <span>Discounts Applied</span>
                    <span>-₹{(billData.discountAmount ?? 0).toFixed(2)}</span>
                  </div>
                )}

                {billData.restaurant?.gstEnabled && (billData.taxAmount ?? 0) > 0 && (
                  <>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>CGST</span>
                      <span>₹{(billData.cgstAmount ?? 0).toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>SGST</span>
                      <span>₹{(billData.sgstAmount ?? 0).toFixed(2)}</span>
                    </div>
                    {billData.taxMode === "INCLUSIVE" ? (
                      <div className="flex justify-between text-[10px] text-slate-400 italic">
                        <span>Total GST (Included in prices)</span>
                        <span>₹{(billData.taxAmount ?? 0).toFixed(2)}</span>
                      </div>
                    ) : (
                      <div className="flex justify-between text-slate-300 font-semibold">
                        <span>Total GST</span>
                        <span>+₹{(billData.taxAmount ?? 0).toFixed(2)}</span>
                      </div>
                    )}
                  </>
                )}

                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800 text-sm font-bold text-white">
                  <span>FINAL PAYABLE AMOUNT</span>
                  <span className="text-base text-amber-400">₹{(billData.totalAmount ?? 0).toFixed(2)}</span>
                </div>
              </div>

              {/* Footer Note */}
              <div className="text-center pt-2 text-[10px] text-slate-400 border-t border-slate-800/60">
                {isPaid ? (
                  <p className="text-emerald-400 font-semibold">
                    ✓ Thank you! Your payment has been confirmed at the counter.
                  </p>
                ) : (
                  <p className="text-amber-300">
                    * Payment must be confirmed at the restaurant billing counter.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

          {/* Staff Counter Payment Action Box */}
          {isStaffMode && billData && !isPaid && (
            <div className="p-4 rounded-2xl bg-slate-800/70 border border-slate-700/80 space-y-4 no-print">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Store className="w-4 h-4 text-amber-400" />
                <span>Staff Counter Payment Confirmation</span>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1.5">
                  Select Payment Method:
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedMethod("CASH")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      selectedMethod === "CASH"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod("UPI")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      selectedMethod === "UPI"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    <span>UPI</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedMethod("CARD")}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition ${
                      selectedMethod === "CARD"
                        ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                        : "bg-slate-900 text-slate-400 border-slate-700 hover:text-white"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-300 block mb-1">
                  Staff Notes (Optional):
                </label>
                <input
                  type="text"
                  value={staffNotes}
                  onChange={(e) => setStaffNotes(e.target.value)}
                  placeholder="e.g. Received by cashier Raj"
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                />
              </div>

              <button
                type="button"
                onClick={handlePaymentSubmit}
                disabled={isProcessingPayment}
                className="w-full py-3 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 disabled:opacity-50 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 cursor-pointer"
              >
                {isProcessingPayment ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Confirming Payment & Generating Receipt...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Payment & Settle Table Bill (₹{billData.totalAmount.toFixed(2)})</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/90 flex items-center justify-between gap-3 no-print">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            Close
          </button>

          {billData && (
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-2"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print {isPaid ? "Receipt" : "Bill"}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
