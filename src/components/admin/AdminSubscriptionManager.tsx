"use client";

import React, { useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  ShieldCheck,
  Settings,
  RefreshCw,
  Search,
  Power,
  CalendarPlus,
  Tag,
} from "lucide-react";
import {
  SubscriptionPlan,
  PaymentMethod,
  PaymentRequestStatus,
  SubscriptionStatus,
  BillingPeriod,
  SubscriptionPaymentStatus,
} from "@prisma/client";
import { formatDate } from "@/lib/utils/format";

interface PaymentRequestItem {
  id: string;
  restaurantId: string;
  plan: SubscriptionPlan;
  billingPeriod?: BillingPeriod;
  tableCount: number;
  amount: number | string;
  amountPaise: number;
  paymentMethod: PaymentMethod;
  utrReference: string;
  proofUrl: string | null;
  notes: string | null;
  status: PaymentRequestStatus;
  adminNotes: string | null;
  reviewedAt: string | null;
  createdAt: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    approvalStatus: string;
  };
  reviewedBy?: {
    id: string;
    name: string;
    email: string;
  } | null;
}

interface SubscriptionItem {
  id: string;
  restaurantId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
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
  notes: string | null;
  evaluated: {
    isValid: boolean;
    isExpired: boolean;
    isSuspended: boolean;
    daysRemaining: number;
    billingPeriod?: BillingPeriod;
    currency?: string;
    customMonthlyPrice?: number;
    customYearlyPrice?: number;
    assignedAmount?: number;
    paymentStatus?: SubscriptionPaymentStatus;
    nextBillingDate?: Date | string | null;
  };
  restaurant: {
    id: string;
    name: string;
    slug: string;
    approvalStatus: string;
    isActive: boolean;
    isSuspended: boolean;
  };
}

interface PaymentConfig {
  upiId: string;
  payeeName: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  accountType: string;
  instructions: string | null;
}

export interface AdminSubscriptionManagerProps {
  initialSubscriptions: SubscriptionItem[];
  initialPaymentRequests: PaymentRequestItem[];
  initialPaymentConfig: PaymentConfig;
}

export function AdminSubscriptionManager({
  initialSubscriptions,
  initialPaymentRequests,
  initialPaymentConfig,
}: AdminSubscriptionManagerProps) {
  const [activeTab, setActiveTab] = useState<"requests" | "subscriptions" | "config">("requests");
  const [subscriptions, setSubscriptions] = useState<SubscriptionItem[]>(initialSubscriptions);
  const [paymentRequests, setPaymentRequests] = useState<PaymentRequestItem[]>(initialPaymentRequests);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");

  // Review modal state
  const [reviewModalRequest, setReviewModalRequest] = useState<PaymentRequestItem | null>(null);
  const [reviewDecision, setReviewDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [reviewNotes, setReviewNotes] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);

  // Extend / Suspend modal state
  const [manageSubModal, setManageSubModal] = useState<SubscriptionItem | null>(null);
  const [manageAction, setManageAction] = useState<"EXTEND" | "SUSPEND" | "ACTIVATE">("EXTEND");
  const [manageDays, setManageDays] = useState(30);
  const [manageReason, setManageReason] = useState("");
  const [manageSubmitting, setManageSubmitting] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  // Custom Pricing Modal state
  const [pricingModalSub, setPricingModalSub] = useState<SubscriptionItem | null>(null);
  const [pricingMonthly, setPricingMonthly] = useState<string>("499");
  const [pricingYearly, setPricingYearly] = useState<string>("4990");
  const [pricingPeriod, setPricingPeriod] = useState<BillingPeriod>(BillingPeriod.MONTHLY);
  const [pricingNextBilling, setPricingNextBilling] = useState<string>("");
  const [pricingPaymentStatus, setPricingPaymentStatus] = useState<SubscriptionPaymentStatus>(SubscriptionPaymentStatus.PAID);
  const [pricingSubStatus, setPricingSubStatus] = useState<SubscriptionStatus>(SubscriptionStatus.ACTIVE);
  const [pricingCurrency, setPricingCurrency] = useState<string>("INR");
  const [pricingSubmitting, setPricingSubmitting] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);

  function openCustomPricingModal(sub: SubscriptionItem) {
    setPricingModalSub(sub);
    const monthly = sub.customMonthlyPrice != null ? Number(sub.customMonthlyPrice) : 499;
    const yearly = sub.customYearlyPrice != null ? Number(sub.customYearlyPrice) : 4990;
    setPricingMonthly(String(monthly));
    setPricingYearly(String(yearly));
    setPricingPeriod(sub.billingPeriod || BillingPeriod.MONTHLY);

    const rawDate = sub.nextBillingDate || sub.endDate;
    if (rawDate) {
      const d = new Date(rawDate);
      if (!isNaN(d.getTime())) {
        setPricingNextBilling(d.toISOString().split("T")[0]);
      } else {
        setPricingNextBilling("");
      }
    } else {
      setPricingNextBilling("");
    }

    setPricingPaymentStatus(sub.paymentStatus || SubscriptionPaymentStatus.PAID);
    setPricingSubStatus(sub.status || SubscriptionStatus.ACTIVE);
    setPricingCurrency(sub.currency || "INR");
    setPricingError(null);
    setPricingSuccess(null);
  }

  async function handleSaveCustomPricing(e: React.FormEvent) {
    e.preventDefault();
    if (!pricingModalSub) return;
    setPricingError(null);
    setPricingSuccess(null);

    const monthlyVal = parseFloat(pricingMonthly);
    const yearlyVal = parseFloat(pricingYearly);

    if (isNaN(monthlyVal) || monthlyVal < 0) {
      setPricingError("Please enter a valid monthly price (cannot be negative).");
      return;
    }
    if (isNaN(yearlyVal) || yearlyVal < 0) {
      setPricingError("Please enter a valid yearly price (cannot be negative).");
      return;
    }

    setPricingSubmitting(true);

    try {
      const res = await fetch(`/api/admin/restaurants/${pricingModalSub.restaurantId}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          monthlyPrice: monthlyVal,
          yearlyPrice: yearlyVal,
          billingPeriod: pricingPeriod,
          nextBillingDate: pricingNextBilling ? new Date(pricingNextBilling).toISOString() : null,
          paymentStatus: pricingPaymentStatus,
          subscriptionStatus: pricingSubStatus,
          currency: pricingCurrency.trim() || "INR",
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setPricingError(data.error || "Failed to update custom pricing.");
        return;
      }

      setPricingSuccess("Custom pricing saved successfully!");
      await refreshData();
      setTimeout(() => {
        setPricingModalSub(null);
      }, 500);
    } catch {
      setPricingError("Network error while updating custom pricing.");
    } finally {
      setPricingSubmitting(false);
    }
  }

  // Config form state
  const [configForm, setConfigForm] = useState<PaymentConfig>(initialPaymentConfig);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState<{ text: string; error?: boolean } | null>(null);

  async function refreshData() {
    setLoading(true);
    try {
      const [subRes, confRes] = await Promise.all([
        fetch("/api/admin/subscriptions"),
        fetch("/api/admin/payment-config"),
      ]);
      const subData = await subRes.json();
      const confData = await confRes.json();

      if (subData.success) {
        setSubscriptions(subData.data.subscriptions);
        setPaymentRequests(subData.data.paymentRequests);
      }
      if (confData.success) {
        setConfigForm(confData.data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleReviewSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reviewModalRequest) return;
    setReviewError(null);
    setReviewSubmitting(true);

    try {
      const res = await fetch(
        `/api/admin/subscriptions/payment-requests/${reviewModalRequest.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: reviewDecision,
            adminNotes: reviewNotes.trim() || undefined,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        setReviewError(data.error || "Failed to process review.");
        return;
      }

      setReviewModalRequest(null);
      setReviewNotes("");
      await refreshData();
    } catch {
      setReviewError("Network error while submitting review.");
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function handleManageSubscription(e: React.FormEvent) {
    e.preventDefault();
    if (!manageSubModal) return;
    setManageError(null);

    if (!manageReason.trim() || manageReason.trim().length < 3) {
      setManageError("Please enter a clear reason for the audit log (at least 3 characters).");
      return;
    }

    setManageSubmitting(true);

    try {
      const res = await fetch(`/api/admin/subscriptions/${manageSubModal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: manageAction,
          days: manageAction === "SUSPEND" ? undefined : manageDays,
          reason: manageReason.trim(),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setManageError(data.error || "Failed to update subscription.");
        return;
      }

      setManageSubModal(null);
      setManageReason("");
      await refreshData();
    } catch {
      setManageError("Network error while modifying subscription.");
    } finally {
      setManageSubmitting(false);
    }
  }

  async function handleSaveConfig(e: React.FormEvent) {
    e.preventDefault();
    setConfigSaving(true);
    setConfigMsg(null);

    try {
      const res = await fetch("/api/admin/payment-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(configForm),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setConfigMsg({ text: data.error || "Failed to save configuration.", error: true });
        return;
      }

      setConfigForm(data.data);
      setConfigMsg({ text: "Payment instructions updated successfully!" });
    } catch {
      setConfigMsg({ text: "Network error while saving settings.", error: true });
    } finally {
      setConfigSaving(false);
    }
  }

  const pendingRequests = paymentRequests.filter(
    (r) => r.status === PaymentRequestStatus.PENDING
  );

  const filteredRequests = paymentRequests.filter((r) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      r.restaurant.name.toLowerCase().includes(term) ||
      r.utrReference.toLowerCase().includes(term) ||
      r.plan.toLowerCase().includes(term)
    );
  });

  const filteredSubscriptions = subscriptions.filter((s) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      s.restaurant.name.toLowerCase().includes(term) ||
      s.restaurant.slug.toLowerCase().includes(term) ||
      s.plan.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* Sub-navigation Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("requests")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "requests"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Payment Requests</span>
            {pendingRequests.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-extrabold ml-1">
                {pendingRequests.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("subscriptions")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "subscriptions"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Active Subscriptions ({subscriptions.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("config")}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === "config"
                ? "bg-amber-400 text-slate-950 shadow-md shadow-amber-500/20"
                : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Payment Settings</span>
          </button>
        </div>

        <div className="flex items-center gap-3">
          {activeTab !== "config" && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search restaurant or UTR..."
                className="pl-8 pr-3 py-1.5 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 w-48 sm:w-60"
              />
            </div>
          )}

          <button
            type="button"
            onClick={refreshData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Refresh subscription data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* TAB 1: PAYMENT REQUESTS */}
      {activeTab === "requests" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Submitted Payment Requests</h3>
              <p className="text-xs text-slate-400">
                Verify UTR numbers against banking records before approving. Subscriptions activate immediately upon approval.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {filteredRequests.length} total request(s)
            </span>
          </div>

          {filteredRequests.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 text-slate-400 text-sm">
              No payment requests found matching your filter.
            </div>
          ) : (
            <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Restaurant</th>
                      <th className="py-3 px-4">Plan & Tables</th>
                      <th className="py-3 px-4">Amount</th>
                      <th className="py-3 px-4">Method & UTR</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4 font-mono text-slate-400" suppressHydrationWarning>
                          {formatDate(req.createdAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-white block">
                            {req.restaurant.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            /r/{req.restaurant.slug}
                          </span>
                          {req.restaurant.approvalStatus !== "APPROVED" && (
                            <span className="block text-[10px] text-amber-400 font-semibold mt-0.5">
                              ⚠️ Pending Restaurant Vetting
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-white block">{req.plan}</span>
                          <span className="text-slate-400 text-[11px]">
                            {req.tableCount} tables limit
                          </span>
                        </td>
                        <td className="py-3.5 px-4 font-bold text-white">
                          ₹{Number(req.amount)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-[10px] uppercase font-bold text-slate-400 block">
                            {req.paymentMethod}
                          </span>
                          <span className="font-mono text-amber-400 font-medium">
                            {req.utrReference}
                          </span>
                          {req.proofUrl && (
                            <a
                              href={req.proofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] text-cyan-400 hover:underline flex items-center gap-1 mt-0.5"
                            >
                              <span>View Proof</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              req.status === PaymentRequestStatus.APPROVED
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                : req.status === PaymentRequestStatus.PENDING
                                ? "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                                : "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                            }`}
                          >
                            {req.status}
                          </span>
                          {req.adminNotes && (
                            <div className="text-[11px] text-slate-400 max-w-xs truncate mt-1">
                              Note: {req.adminNotes}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {req.status === PaymentRequestStatus.PENDING ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewModalRequest(req);
                                  setReviewDecision("APPROVED");
                                  setReviewNotes("");
                                  setReviewError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReviewModalRequest(req);
                                  setReviewDecision("REJECTED");
                                  setReviewNotes("");
                                  setReviewError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition flex items-center gap-1 cursor-pointer"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-500" suppressHydrationWarning>
                              Reviewed {req.reviewedAt ? formatDate(req.reviewedAt) : ""}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ACTIVE SUBSCRIPTIONS */}
      {activeTab === "subscriptions" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Active Subscriptions & Floor Limits</h3>
              <p className="text-xs text-slate-400">
                View platform-wide subscriber statuses, table allowances, and manually extend or suspend accounts.
              </p>
            </div>
            <span className="text-xs text-slate-400">
              {filteredSubscriptions.length} subscription(s)
            </span>
          </div>

          {filteredSubscriptions.length === 0 ? (
            <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 text-slate-400 text-sm">
              No subscriptions found.
            </div>
          ) : (
            <div className="glass-card rounded-2xl border border-slate-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-900/90 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
                    <tr>
                      <th className="py-3 px-4">Restaurant</th>
                      <th className="py-3 px-4">Plan & Tables</th>
                      <th className="py-3 px-4">Custom Pricing</th>
                      <th className="py-3 px-4">Next Billing Date</th>
                      <th className="py-3 px-4">Payment Status</th>
                      <th className="py-3 px-4">Subscription Status</th>
                      <th className="py-3 px-4 text-right">Admin Controls</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80">
                    {filteredSubscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-white block">
                            {sub.restaurant.name}
                          </span>
                          <span className="font-mono text-[10px] text-slate-400">
                            /r/{sub.restaurant.slug}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="font-semibold text-white block">{sub.plan}</span>
                          <span className="text-[11px] text-cyan-400 font-medium">
                            {sub.tableLimit} max tables
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-1">
                            <div className="font-bold text-white flex items-center gap-1.5">
                              <span>₹{Number(sub.customMonthlyPrice ?? sub.amount)}</span>
                              <span className="text-[10px] text-slate-400 font-normal">/ mo</span>
                            </div>
                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5">
                              <span>₹{Number(sub.customYearlyPrice ?? (Number(sub.customMonthlyPrice ?? sub.amount) * 10))}</span>
                              <span className="text-[10px] text-slate-500">/ yr</span>
                            </div>
                            <span className="inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-purple-500/15 text-purple-300 border border-purple-500/25">
                              {sub.billingPeriod || "MONTHLY"}
                            </span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <span className="text-slate-300 block font-medium" suppressHydrationWarning>
                            {formatDate(sub.nextBillingDate || sub.endDate)}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {sub.evaluated.daysRemaining} days remaining
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              sub.paymentStatus === "PAID"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                : sub.paymentStatus === "OVERDUE"
                                ? "bg-rose-500/15 text-rose-400 border border-rose-500/25"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                            }`}
                          >
                            {sub.paymentStatus || "PAID"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                              sub.evaluated.isValid
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                                : sub.evaluated.isSuspended
                                ? "bg-red-500/15 text-red-400 border border-red-500/25"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/25"
                            }`}
                          >
                            {sub.evaluated.isValid ? "Active" : sub.evaluated.isSuspended ? "Suspended" : "Expired"}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openCustomPricingModal(sub)}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 transition flex items-center gap-1 cursor-pointer"
                              title="Configure custom subscription pricing"
                            >
                              <Tag className="w-3.5 h-3.5 text-amber-400" />
                              <span>Custom Pricing</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setManageSubModal(sub);
                                setManageAction("EXTEND");
                                setManageDays(30);
                                setManageReason("");
                                setManageError(null);
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center gap-1 cursor-pointer"
                            >
                              <CalendarPlus className="w-3.5 h-3.5 text-amber-400" />
                              <span>Extend</span>
                            </button>

                            {!sub.evaluated.isValid || sub.status === SubscriptionStatus.SUSPENDED || sub.status === SubscriptionStatus.EXPIRED ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setManageSubModal(sub);
                                  setManageAction("ACTIVATE");
                                  setManageDays(30);
                                  setManageReason("");
                                  setManageError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition flex items-center gap-1 cursor-pointer"
                                title="Activate or Reactivate this subscription"
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>Activate</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  setManageSubModal(sub);
                                  setManageAction("SUSPEND");
                                  setManageReason("");
                                  setManageError(null);
                                }}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-rose-500/15 hover:bg-rose-500/25 text-rose-400 border border-rose-500/30 transition flex items-center gap-1 cursor-pointer"
                                title="Suspend this subscription"
                              >
                                <Power className="w-3.5 h-3.5" />
                                <span>Suspend</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PAYMENT CONFIGURATION */}
      {activeTab === "config" && (
        <div className="max-w-2xl glass-card rounded-2xl p-6 border border-slate-800 space-y-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 uppercase tracking-wider mb-1">
              <Settings className="w-4 h-4" />
              <span>Platform Financial Controls</span>
            </div>
            <h3 className="text-xl font-bold text-white">UPI & Bank Transfer Settings</h3>
            <p className="text-xs text-slate-400 mt-1">
              These instructions are presented to restaurant owners when they submit subscription payments.
            </p>
          </div>

          {configMsg && (
            <div
              className={`p-3 rounded-xl text-xs font-medium ${
                configMsg.error
                  ? "bg-rose-500/10 text-rose-300 border border-rose-500/20"
                  : "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20"
              }`}
            >
              {configMsg.text}
            </div>
          )}

          <form onSubmit={handleSaveConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  UPI ID (VPA) <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.upiId}
                  onChange={(e) => setConfigForm({ ...configForm, upiId: e.target.value })}
                  placeholder="e.g., qrserve@upi"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Payee Account Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.payeeName}
                  onChange={(e) => setConfigForm({ ...configForm, payeeName: e.target.value })}
                  placeholder="e.g., QRServe Platform Pvt Ltd"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Bank Name <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.bankName}
                  onChange={(e) => setConfigForm({ ...configForm, bankName: e.target.value })}
                  placeholder="e.g., HDFC Bank"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Account Type <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.accountType}
                  onChange={(e) => setConfigForm({ ...configForm, accountType: e.target.value })}
                  placeholder="e.g., Current Account"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Bank Account Number <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.accountNumber}
                  onChange={(e) => setConfigForm({ ...configForm, accountNumber: e.target.value })}
                  placeholder="e.g., 50200012345678"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  IFSC Code <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={configForm.ifscCode}
                  onChange={(e) => setConfigForm({ ...configForm, ifscCode: e.target.value })}
                  placeholder="e.g., HDFC0001234"
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 font-mono"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Payment Instructions / Notes
              </label>
              <textarea
                rows={3}
                value={configForm.instructions || ""}
                onChange={(e) => setConfigForm({ ...configForm, instructions: e.target.value })}
                placeholder="Mention remarks, verification timeframe, etc."
                className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
              />
            </div>

            <button
              type="submit"
              disabled={configSaving}
              className="px-5 py-2.5 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-50"
            >
              {configSaving ? "Saving..." : "Save Payment Configuration"}
            </button>
          </form>
        </div>
      )}

      {/* Review Payment Modal */}
      {reviewModalRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-400" />
                <span>
                  {reviewDecision === "APPROVED" ? "Approve Payment" : "Reject Payment"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setReviewModalRequest(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {reviewError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {reviewError}
              </div>
            )}

            <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1 font-mono">
              <div>Restaurant: {reviewModalRequest.restaurant.name}</div>
              <div>Plan: {reviewModalRequest.plan} ({reviewModalRequest.tableCount} tables)</div>
              <div>Amount: ₹{Number(reviewModalRequest.amount)}</div>
              <div>UTR Reference: {reviewModalRequest.utrReference}</div>
            </div>

            <form onSubmit={handleReviewSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Audit Notes / Reason
                </label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder={
                    reviewDecision === "APPROVED"
                      ? "Optional confirmation remarks (e.g., Verified in HDFC statement)..."
                      : "Reason for rejection (e.g., UTR not matching statement)..."
                  }
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setReviewModalRequest(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={reviewSubmitting}
                  className={`px-4 py-2 rounded-xl text-xs font-bold text-slate-950 transition cursor-pointer ${
                    reviewDecision === "APPROVED"
                      ? "bg-emerald-400 hover:bg-emerald-300"
                      : "bg-rose-400 hover:bg-rose-300 text-white"
                  }`}
                >
                  {reviewSubmitting
                    ? "Processing..."
                    : reviewDecision === "APPROVED"
                    ? "Confirm Approval"
                    : "Confirm Rejection"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Extend / Suspend Modal */}
      {manageSubModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Power className="w-5 h-5 text-amber-400" />
                <span>
                  {manageAction === "EXTEND"
                    ? "Extend Subscription"
                    : manageAction === "SUSPEND"
                    ? "Suspend Subscription"
                    : "Activate Subscription"}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setManageSubModal(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            {manageError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {manageError}
              </div>
            )}

            <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 space-y-1">
              <div>Restaurant: <strong>{manageSubModal.restaurant.name}</strong></div>
              <div>Current Plan: {manageSubModal.plan} ({manageSubModal.tableLimit} tables)</div>
              <div suppressHydrationWarning>Expires: {formatDate(manageSubModal.endDate)}</div>
            </div>

            <form onSubmit={handleManageSubscription} className="space-y-4">
              {(manageAction === "EXTEND" || manageAction === "ACTIVATE") && (
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    {manageAction === "ACTIVATE" ? "Validity Period (Days)" : "Extension Days"}
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={manageDays}
                    onChange={(e) => setManageDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Recorded Audit Reason <span className="text-amber-400">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={manageReason}
                  onChange={(e) => setManageReason(e.target.value)}
                  placeholder="Mandatory reason for audit logs (e.g. Courtesy promotional extension, payment dispute hold, etc.)..."
                  className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setManageSubModal(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={manageSubmitting}
                  className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                    manageAction === "ACTIVATE"
                      ? "bg-emerald-400 hover:bg-emerald-300 text-slate-950 shadow-md shadow-emerald-500/20"
                      : manageAction === "SUSPEND"
                      ? "bg-rose-500 hover:bg-rose-400 text-white shadow-md shadow-rose-500/20"
                      : "bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-md shadow-amber-500/20"
                  }`}
                >
                  {manageSubmitting
                    ? "Saving..."
                    : manageAction === "ACTIVATE"
                    ? "Activate Subscription"
                    : manageAction === "SUSPEND"
                    ? "Suspend Subscription"
                    : "Extend Subscription"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Custom Pricing Modal */}
      {pricingModalSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" />
                <span>Custom Subscription Pricing</span>
              </h3>
              <button
                type="button"
                onClick={() => setPricingModalSub(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Restaurant</span>
                <strong className="text-white text-sm">{pricingModalSub.restaurant.name}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Tenant Slug</span>
                <span className="font-mono text-cyan-400">/r/{pricingModalSub.restaurant.slug}</span>
              </div>
            </div>

            {pricingError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs">
                {pricingError}
              </div>
            )}

            {pricingSuccess && (
              <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs">
                {pricingSuccess}
              </div>
            )}

            <form onSubmit={handleSaveCustomPricing} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Monthly Price (₹) <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={pricingMonthly}
                      onChange={(e) => setPricingMonthly(e.target.value)}
                      placeholder="e.g. 499"
                      className="w-full pl-7 pr-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Yearly Price (₹) <span className="text-amber-400">*</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2.5 text-xs text-slate-400 font-bold">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={pricingYearly}
                      onChange={(e) => setPricingYearly(e.target.value)}
                      placeholder="e.g. 4990"
                      className="w-full pl-7 pr-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Billing Period <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={pricingPeriod}
                    onChange={(e) => setPricingPeriod(e.target.value as BillingPeriod)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="MONTHLY">Monthly</option>
                    <option value="YEARLY">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Next Billing Date
                  </label>
                  <input
                    type="date"
                    value={pricingNextBilling}
                    onChange={(e) => setPricingNextBilling(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Payment Status <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={pricingPaymentStatus}
                    onChange={(e) => setPricingPaymentStatus(e.target.value as SubscriptionPaymentStatus)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="PAID">Paid</option>
                    <option value="PENDING">Pending</option>
                    <option value="OVERDUE">Overdue</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Subscription Status <span className="text-amber-400">*</span>
                  </label>
                  <select
                    value={pricingSubStatus}
                    onChange={(e) => setPricingSubStatus(e.target.value as SubscriptionStatus)}
                    className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400 cursor-pointer"
                  >
                    <option value="ACTIVE">Active</option>
                    <option value="SUSPENDED">Suspended</option>
                    <option value="EXPIRED">Expired</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Currency
                </label>
                <input
                  type="text"
                  value={pricingCurrency}
                  onChange={(e) => setPricingCurrency(e.target.value)}
                  placeholder="INR"
                  className="w-full px-3 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white font-mono focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setPricingModalSub(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pricingSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 transition cursor-pointer shadow-md shadow-amber-500/20 disabled:opacity-50"
                >
                  {pricingSubmitting ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
