"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CreditCard,
  AlertTriangle,
  Clock,
  ArrowRight,
  Copy,
  Check,
  Building,
  Table as TableIcon,
  ShieldAlert,
  ArrowLeft,
  Calendar,
  Lock,
} from "lucide-react";
import {
  SubscriptionPlan,
  BillingPeriod,
  PaymentMethod,
  PaymentRequestStatus,
  SubscriptionPaymentStatus,
  ApprovalStatus,
} from "@prisma/client";
import { formatDate } from "@/lib/utils/format";

interface SubscriptionManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    approvalStatus: ApprovalStatus;
  };
  initialData: {
    subscription: {
      id: string;
      plan: SubscriptionPlan;
      status: string;
      billingPeriod?: BillingPeriod;
      currency?: string;
      customMonthlyPrice?: number | string;
      customYearlyPrice?: number | string;
      paymentStatus?: SubscriptionPaymentStatus;
      nextBillingDate?: string | null;
      tableLimit: number;
      amount: number | string;
      startDate: string;
      endDate: string;
      notes?: string | null;
    } | null;
    evaluated: {
      hasSubscription: boolean;
      isValid: boolean;
      isExpired: boolean;
      isSuspended: boolean;
      isNearExpiry: boolean;
      daysRemaining: number;
      tableLimit: number;
      plan: string | null;
      status: string | null;
      endDate: string | null;
      billingPeriod?: BillingPeriod;
      currency?: string;
      customMonthlyPrice?: number;
      customYearlyPrice?: number;
      assignedAmount?: number;
      paymentStatus?: SubscriptionPaymentStatus;
      nextBillingDate?: string | Date | null;
    };
    assignedPricing?: {
      monthlyPrice: number;
      yearlyPrice: number;
      billingPeriod: BillingPeriod;
      assignedAmount: number;
      currency: string;
      paymentStatus: SubscriptionPaymentStatus;
      nextBillingDate: string | null;
    };
    paymentRequests: Array<{
      id: string;
      plan: SubscriptionPlan;
      billingPeriod?: BillingPeriod;
      tableCount: number;
      amount: number | string;
      paymentMethod: PaymentMethod;
      utrReference: string;
      status: PaymentRequestStatus;
      adminNotes?: string | null;
      reviewedAt?: string | null;
      createdAt: string;
    }>;
    paymentConfig: {
      upiId: string;
      payeeName: string;
      bankName: string;
      accountNumber: string;
      ifscCode: string;
      accountType: string;
      instructions?: string | null;
    };
    tableUsage: {
      totalTables: number;
      activeTables: number;
      remainingAllowance: number;
      isAtLimit: boolean;
    };
    pricingCatalog?: {
      small?: { name: string; priceRupees: number; tableLimit: number; description: string };
      medium?: { name: string; priceRupees: number; tableLimit: number; description: string };
      large?: { name: string; pricePerTableRupees: number; description: string };
    };
  };
}

export function RestaurantSubscriptionManager({
  restaurant,
  initialData,
}: SubscriptionManagerProps) {
  const [data, setData] = useState(initialData);

  // Default to restaurant's assigned billing period
  const defaultPeriod =
    data.evaluated?.billingPeriod ||
    data.subscription?.billingPeriod ||
    BillingPeriod.MONTHLY;

  const [selectedPeriod, setSelectedPeriod] = useState<BillingPeriod>(defaultPeriod);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PaymentMethod.UPI);
  const [utrReference, setUtrReference] = useState("");
  const [proofUrl, setProofUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [copiedBank, setCopiedBank] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const { evaluated, tableUsage, paymentConfig, paymentRequests, subscription } = data;
  const isApproved = restaurant.approvalStatus === ApprovalStatus.APPROVED;

  // Resolve assigned pricing
  const customMonthlyPrice =
    evaluated?.customMonthlyPrice != null
      ? evaluated.customMonthlyPrice
      : subscription?.customMonthlyPrice != null
      ? Number(subscription.customMonthlyPrice)
      : 499;

  const customYearlyPrice =
    evaluated?.customYearlyPrice != null
      ? evaluated.customYearlyPrice
      : subscription?.customYearlyPrice != null
      ? Number(subscription.customYearlyPrice)
      : 4990;

  // Amount calculated strictly based on selected period and server-assigned price
  const activePayableAmount =
    selectedPeriod === BillingPeriod.YEARLY ? customYearlyPrice : customMonthlyPrice;

  const currencySymbol = (evaluated?.currency || subscription?.currency || "INR") === "INR" ? "₹" : "₹";

  function copyToClipboard(text: string, type: "upi" | "bank") {
    navigator.clipboard.writeText(text);
    if (type === "upi") {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2000);
    } else {
      setCopiedBank(true);
      setTimeout(() => setCopiedBank(false), 2000);
    }
  }

  async function handleRefresh() {
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/subscription`);
      const result = await res.json();
      if (result.success) {
        setData(result.data);
      }
    } catch (e) {
      console.error("Refresh error:", e);
    }
  }

  async function handleSubmitPayment(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!utrReference.trim()) {
      setFormError("Please enter your transaction reference (UTR) number.");
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(
        `/api/restaurants/${restaurant.id}/subscription/payment-requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: subscription?.plan || SubscriptionPlan.SMALL,
            billingPeriod: selectedPeriod,
            paymentMethod,
            utrReference: utrReference.trim(),
            proofUrl: proofUrl.trim() || null,
            notes: notes.trim() || null,
          }),
        }
      );

      const resData = await res.json();

      if (!res.ok || !resData.success) {
        setFormError(resData.error || "Failed to submit payment details.");
        return;
      }

      setFormSuccess(
        "Payment request submitted! Super Admin will verify your transaction against bank records and renew your subscription."
      );
      setUtrReference("");
      setProofUrl("");
      setNotes("");
      await handleRefresh();
    } catch {
      setFormError("A network error occurred while submitting payment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header and Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition mb-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Dashboard
          </Link>
          <h1 className="text-3xl font-extrabold tracking-tight text-white flex items-center gap-3">
            <span>Subscription & Billing</span>
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
              {restaurant.name}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            View assigned subscription rates, renewal schedules, and submit offline payment verifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/restaurants/${restaurant.id}/tables`}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-200 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 transition flex items-center gap-2"
          >
            <TableIcon className="w-4 h-4 text-cyan-400" />
            Manage Tables ({tableUsage.activeTables}/{evaluated.tableLimit || 0})
          </Link>
        </div>
      </div>

      {/* Restaurant Approval Guard Notice */}
      {!isApproved && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400" />
          <div>
            <span className="font-bold">Restaurant Pending Super Admin Approval:</span> You can
            review your assigned subscription information and submit offline payment references, but
            your subscription will be formally activated by Super Admin alongside restaurant vetting.
          </div>
        </div>
      )}

      {/* Near Expiry Warning Banner */}
      {evaluated.isNearExpiry && (
        <div className="p-4 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-sm flex items-start gap-3">
          <Clock className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-400 animate-pulse" />
          <div>
            <span className="font-bold">Subscription Expiring Soon:</span> You have{" "}
            <span className="font-extrabold underline">{evaluated.daysRemaining} days remaining</span>{" "}
            in your current cycle. Renew today to keep your table limits and QR ordering active
            without interruption. Early renewals seamlessly extend from your current expiry date.
          </div>
        </div>
      )}

      {/* Expired Warning Banner */}
      {evaluated.isExpired && (
        <div className="p-4 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-200 text-sm flex items-start gap-3">
          <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5 text-red-400" />
          <div>
            <span className="font-bold">Subscription Expired:</span> Your subscription
            expired on{" "}
            <span suppressHydrationWarning>
              {evaluated.nextBillingDate || evaluated.endDate
                ? formatDate(evaluated.nextBillingDate || evaluated.endDate!)
                : "earlier"}
            </span>
            . Existing tables and QR codes are preserved safely, but creating new tables or public
            ordering requires submitting a renewal payment below.
          </div>
        </div>
      )}

      {/* Assigned Information Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Subscription Status */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Subscription Status</span>
            <CreditCard className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white flex items-center gap-2">
            {evaluated.hasSubscription ? (
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                  evaluated.isValid
                    ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                    : evaluated.isSuspended
                    ? "bg-red-500/20 text-red-400 border border-red-500/30"
                    : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                }`}
              >
                {evaluated.status || "ACTIVE"}
              </span>
            ) : (
              <span className="text-slate-400 text-sm">Not Configured</span>
            )}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Plan Tier: <strong className="text-slate-200">{evaluated.plan || "Standard"}</strong>
          </div>
        </div>

        {/* Card 2: Current Billing Period */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Billing Period</span>
            <Calendar className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white capitalize">
            {(evaluated.billingPeriod || subscription?.billingPeriod || "MONTHLY").toLowerCase()}
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Cycle Duration: {evaluated.billingPeriod === "YEARLY" ? "365 days" : "30 days"}
          </div>
        </div>

        {/* Card 3: Assigned Subscription Amount */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Assigned Price</span>
            <Building className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {currencySymbol}
            {evaluated.billingPeriod === "YEARLY" ? customYearlyPrice : customMonthlyPrice}
            <span className="text-xs text-slate-400 font-normal ml-1">
              / {evaluated.billingPeriod === "YEARLY" ? "year" : "month"}
            </span>
          </div>
          <div className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>Assigned by Super Admin</span>
          </div>
        </div>

        {/* Card 4: Next Billing Date & Payment Status */}
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Next Billing Date</span>
            <Clock className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-lg font-bold text-white" suppressHydrationWarning>
            {evaluated.nextBillingDate || evaluated.endDate
              ? formatDate(evaluated.nextBillingDate || evaluated.endDate!)
              : "Pending Setup"}
          </div>
          <div className="text-xs mt-2 flex items-center justify-between">
            <span className="text-slate-400">{evaluated.daysRemaining} days left</span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                evaluated.paymentStatus === "PAID"
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  : evaluated.paymentStatus === "OVERDUE"
                  ? "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                  : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
              }`}
            >
              {evaluated.paymentStatus || "PAID"}
            </span>
          </div>
        </div>
      </div>

      {/* Assigned Rate Information Callout */}
      <div className="p-4 rounded-2xl glass-card border border-slate-800 bg-slate-900/40 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Restaurant-Specific Assigned Pricing</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Your restaurant has its own custom pricing structure configured exclusively by Super Admin:
            Monthly Rate is <strong className="text-white">{currencySymbol}{customMonthlyPrice}/month</strong> and Yearly Rate is <strong className="text-white">{currencySymbol}{customYearlyPrice}/year</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
          <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            Monthly: {currencySymbol}{customMonthlyPrice}
          </span>
          <span className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
            Yearly: {currencySymbol}{customYearlyPrice}
          </span>
        </div>
      </div>

      {/* Payment & Submission Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Payment Instructions Card */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider mb-1">
              <CreditCard className="w-4 h-4" />
              <span>Payment Details</span>
            </div>
            <h3 className="text-xl font-bold text-white">How to Complete Renewal</h3>
            <p className="text-xs text-slate-400 mt-1">
              Select your renewal billing period, transfer the exact assigned amount via UPI or Direct Bank Transfer, then submit your transaction reference below.
            </p>
          </div>

          {/* Billing Period Selector */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 block">
              Choose Renewal Period:
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedPeriod(BillingPeriod.MONTHLY)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  selectedPeriod === BillingPeriod.MONTHLY
                    ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-amber-400 block">
                  Monthly Cycle
                </span>
                <span className="text-xl font-extrabold text-white mt-1 block">
                  {currencySymbol}{customMonthlyPrice}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">30 Days validity</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedPeriod(BillingPeriod.YEARLY)}
                className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                  selectedPeriod === BillingPeriod.YEARLY
                    ? "bg-amber-500/10 border-amber-500 ring-2 ring-amber-500/20 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"
                }`}
              >
                <span className="text-xs font-bold uppercase tracking-wider text-purple-400 block">
                  Yearly Cycle
                </span>
                <span className="text-xl font-extrabold text-white mt-1 block">
                  {currencySymbol}{customYearlyPrice}
                </span>
                <span className="text-[11px] text-slate-400 block mt-0.5">365 Days validity</span>
              </button>
            </div>
          </div>

          {/* Amount Due Summary */}
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
            <div>
              <span className="text-xs text-amber-300 font-semibold block">Total Amount to Pay</span>
              <span className="text-2xl font-black text-white">{currencySymbol}{activePayableAmount}</span>
            </div>
            <div className="text-right text-xs text-slate-300">
              <span className="block font-medium capitalize">{selectedPeriod.toLowerCase()} Renewal</span>
              <span className="text-slate-400">{evaluated.tableLimit || 10} Table Allowance</span>
            </div>
          </div>

          {/* UPI Method Card */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-200 uppercase tracking-wide">
                Option 1: UPI Transfer
              </span>
              <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                Fast Verification
              </span>
            </div>
            <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-lg border border-slate-800">
              <div className="font-mono text-sm font-semibold text-white">
                {paymentConfig.upiId}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(paymentConfig.upiId, "upi")}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition flex items-center gap-1.5 cursor-pointer"
              >
                {copiedUpi ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy UPI</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400">Payee Name: {paymentConfig.payeeName}</p>
          </div>

          {/* Bank Transfer Details */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-200 uppercase tracking-wide">
                Option 2: Direct Bank Transfer (NEFT / IMPS)
              </span>
              <button
                type="button"
                onClick={() =>
                  copyToClipboard(
                    `Bank: ${paymentConfig.bankName}\nA/C: ${paymentConfig.accountNumber}\nIFSC: ${paymentConfig.ifscCode}`,
                    "bank"
                  )
                }
                className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] font-medium text-slate-300 transition flex items-center gap-1 cursor-pointer"
              >
                {copiedBank ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedBank ? "Copied" : "Copy All"}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-slate-300 bg-slate-950 p-3 rounded-lg border border-slate-800/80">
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Bank Name</span>
                <span className="font-medium text-white">{paymentConfig.bankName}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Account Type</span>
                <span className="font-medium text-white">{paymentConfig.accountType}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">Account Number</span>
                <span className="font-mono font-medium text-white">{paymentConfig.accountNumber}</span>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500 block">IFSC Code</span>
                <span className="font-mono font-medium text-white">{paymentConfig.ifscCode}</span>
              </div>
            </div>
          </div>

          {/* Instructions */}
          {paymentConfig.instructions && (
            <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800/60">
              <strong className="text-slate-300 block mb-0.5">Payment Instructions:</strong>
              {paymentConfig.instructions}
            </div>
          )}
        </div>

        {/* Payment Submission Form */}
        <div className="glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider mb-1">
              <Check className="w-4 h-4" />
              <span>Submit Payment Verification</span>
            </div>
            <h3 className="text-xl font-bold text-white">Enter Transaction Details</h3>
            <p className="text-xs text-slate-400 mt-1">
              Provide your reference number so Super Admin can verify the transaction against platform statements.
            </p>
          </div>

          {formError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
              {formError}
            </div>
          )}

          {formSuccess && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
              {formSuccess}
            </div>
          )}

          <form onSubmit={handleSubmitPayment} className="space-y-4">
            {/* Read-Only Assigned Amount Display */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Assigned Subscription Amount (Read-Only)
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  disabled
                  value={`${currencySymbol}${activePayableAmount} (${selectedPeriod.toLowerCase()} billing)`}
                  className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-900 border border-slate-800 text-white font-mono font-bold cursor-not-allowed opacity-90"
                />
                <Lock className="w-4 h-4 text-slate-500 absolute right-3.5 top-3" />
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block">
                Subscription amount is assigned by platform administration and cannot be modified.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Select Payment Mode Used <span className="text-amber-400">*</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.UPI)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    paymentMethod === PaymentMethod.UPI
                      ? "bg-amber-400 text-slate-950 border-amber-400 font-bold"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  UPI Transfer
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod(PaymentMethod.BANK_TRANSFER)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    paymentMethod === PaymentMethod.BANK_TRANSFER
                      ? "bg-amber-400 text-slate-950 border-amber-400 font-bold"
                      : "bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700"
                  }`}
                >
                  Bank Transfer (NEFT/IMPS)
                </button>
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                12-Digit Transaction Reference / UTR <span className="text-amber-400">*</span>
              </label>
              <input
                type="text"
                required
                value={utrReference}
                onChange={(e) => setUtrReference(e.target.value)}
                placeholder="e.g., 427918239012"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 font-mono"
              />
              <span className="text-[11px] text-slate-500 mt-1 block">
                Located in your banking or UPI app receipt under UTR, Txn ID, or Ref No.
              </span>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Optional Screenshot / Proof URL
              </label>
              <input
                type="url"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
                placeholder="https://drive.google.com/... or public receipt link"
                className="w-full px-3.5 py-2.5 rounded-xl text-sm bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Customer Remarks / Notes
              </label>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g., Paid from HDFC account ending in 9812..."
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50"
            >
              <span>{submitting ? "Submitting..." : "Submit Payment for Verification"}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>

      {/* Payment Requests History Table */}
      <section className="space-y-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">Payment Requests History</h2>
          <p className="text-xs text-slate-400">
            Audit trail of all your submitted payment references and Super Admin reviews.
          </p>
        </div>

        {paymentRequests.length === 0 ? (
          <div className="glass-card rounded-2xl p-8 text-center border border-dashed border-slate-800 text-slate-400 text-sm">
            No payment requests submitted yet.
          </div>
        ) : (
          <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="bg-slate-900/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Billing Period</th>
                    <th className="py-3 px-4">Assigned Amount</th>
                    <th className="py-3 px-4">Method & UTR</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Admin Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80">
                  {paymentRequests.map((req) => (
                    <tr key={req.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-mono text-slate-400" suppressHydrationWarning>
                        {formatDate(req.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <span className="font-semibold text-white block capitalize">
                          {(req.billingPeriod || "MONTHLY").toLowerCase()}
                        </span>
                        <span className="text-[11px] text-slate-400">{req.tableCount} tables</span>
                      </td>
                      <td className="py-3 px-4 font-semibold text-white">
                        {currencySymbol}{Number(req.amount)}
                      </td>
                      <td className="py-3 px-4 font-mono">
                        <span className="text-slate-400 text-[10px] uppercase block">
                          {req.paymentMethod}
                        </span>
                        <span className="text-amber-400">{req.utrReference}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                            req.status === PaymentRequestStatus.APPROVED
                              ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                              : req.status === PaymentRequestStatus.PENDING
                              ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                              : "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-400 max-w-xs truncate">
                        {req.adminNotes || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
