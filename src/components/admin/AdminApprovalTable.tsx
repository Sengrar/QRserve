"use client";

import React, { useState } from "react";
import { ApprovalStatus } from "@prisma/client";
import { ApprovalBadge, ActivationBadge, SuspensionBadge } from "@/components/ui/Badge";
import { Check, X, ShieldAlert, ShieldCheck, User, Mail, Calendar, AlertCircle, Search, Tag } from "lucide-react";
import { formatDate } from "@/lib/utils/format";

interface AdminRestaurant {
  id: string;
  name: string;
  slug: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  isActive: boolean;
  isSuspended: boolean;
  createdAt: string | Date;
  members: {
    user: {
      id: string;
      name: string;
      email: string;
    };
  }[];
}

interface AdminApprovalTableProps {
  initialRestaurants: AdminRestaurant[];
}

export function AdminApprovalTable({ initialRestaurants }: AdminApprovalTableProps) {
  const [restaurants, setRestaurants] = useState<AdminRestaurant[]>(initialRestaurants);
  const [filter, setFilter] = useState<"ALL" | "PENDING" | "APPROVED" | "SUSPENDED">("ALL");
  const [search, setSearch] = useState("");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Custom Pricing Modal state
  const [pricingRestaurant, setPricingRestaurant] = useState<AdminRestaurant | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [pricingMonthly, setPricingMonthly] = useState("499");
  const [pricingYearly, setPricingYearly] = useState("4990");
  const [pricingPeriod, setPricingPeriod] = useState<"MONTHLY" | "YEARLY">("MONTHLY");
  const [pricingNextBilling, setPricingNextBilling] = useState("");
  const [pricingPaymentStatus, setPricingPaymentStatus] = useState<"PAID" | "PENDING" | "OVERDUE">("PAID");
  const [pricingSubStatus, setPricingSubStatus] = useState<"ACTIVE" | "SUSPENDED" | "EXPIRED">("ACTIVE");
  const [pricingCurrency, setPricingCurrency] = useState("INR");
  const [pricingSubmitting, setPricingSubmitting] = useState(false);
  const [pricingError, setPricingError] = useState<string | null>(null);
  const [pricingSuccess, setPricingSuccess] = useState<string | null>(null);

  async function openPricing(r: AdminRestaurant) {
    setPricingRestaurant(r);
    setPricingLoading(true);
    setPricingError(null);
    setPricingSuccess(null);

    try {
      const res = await fetch(`/api/admin/restaurants/${r.id}/subscription`);
      const data = await res.json();
      if (data.success && data.data?.subscription) {
        const sub = data.data.subscription;
        setPricingMonthly(String(sub.customMonthlyPrice != null ? Number(sub.customMonthlyPrice) : 499));
        setPricingYearly(String(sub.customYearlyPrice != null ? Number(sub.customYearlyPrice) : 4990));
        setPricingPeriod(sub.billingPeriod || "MONTHLY");
        const rawDate = sub.nextBillingDate || sub.endDate;
        if (rawDate) {
          const d = new Date(rawDate);
          setPricingNextBilling(!isNaN(d.getTime()) ? d.toISOString().split("T")[0] : "");
        } else {
          setPricingNextBilling("");
        }
        setPricingPaymentStatus(sub.paymentStatus || "PAID");
        setPricingSubStatus(sub.status || "ACTIVE");
        setPricingCurrency(sub.currency || "INR");
      } else {
        setPricingMonthly("499");
        setPricingYearly("4990");
        setPricingPeriod("MONTHLY");
        setPricingNextBilling("");
        setPricingPaymentStatus("PAID");
        setPricingSubStatus("ACTIVE");
        setPricingCurrency("INR");
      }
    } catch {
      setPricingError("Failed to fetch current subscription details.");
    } finally {
      setPricingLoading(false);
    }
  }

  async function handleSavePricing(e: React.FormEvent) {
    e.preventDefault();
    if (!pricingRestaurant) return;
    setPricingError(null);
    setPricingSuccess(null);

    const monthlyVal = parseFloat(pricingMonthly);
    const yearlyVal = parseFloat(pricingYearly);

    if (isNaN(monthlyVal) || monthlyVal < 0) {
      setPricingError("Please enter a valid monthly price.");
      return;
    }
    if (isNaN(yearlyVal) || yearlyVal < 0) {
      setPricingError("Please enter a valid yearly price.");
      return;
    }

    setPricingSubmitting(true);
    try {
      const res = await fetch(`/api/admin/restaurants/${pricingRestaurant.id}/subscription`, {
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
        setPricingError(data.error || "Failed to save custom pricing.");
        return;
      }

      setPricingSuccess("Custom pricing saved successfully!");
      setTimeout(() => {
        setPricingRestaurant(null);
      }, 500);
    } catch {
      setPricingError("Network error while updating pricing.");
    } finally {
      setPricingSubmitting(false);
    }
  }

  const pendingCount = restaurants.filter((r) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const approvedCount = restaurants.filter((r) => r.approvalStatus === ApprovalStatus.APPROVED).length;
  const suspendedCount = restaurants.filter((r) => r.isSuspended).length;

  const filteredRestaurants = restaurants.filter((r) => {
    if (filter === "PENDING" && r.approvalStatus !== ApprovalStatus.PENDING) return false;
    if (filter === "APPROVED" && r.approvalStatus !== ApprovalStatus.APPROVED) return false;
    if (filter === "SUSPENDED" && !r.isSuspended) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        r.members[0]?.user.name.toLowerCase().includes(q) ||
        r.members[0]?.user.email.toLowerCase().includes(q)
      );
    }
    return true;
  });

  async function updateStatus(
    id: string,
    updates: {
      approvalStatus?: ApprovalStatus;
      rejectionReason?: string;
      isSuspended?: boolean;
    }
  ) {
    setLoadingId(id);
    setError(null);

    try {
      const res = await fetch(`/api/admin/restaurants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update restaurant status.");
        return;
      }

      setRestaurants((prev) =>
        prev.map((r) => (r.id === id ? { ...r, ...data.data } : r))
      );
      setRejectingId(null);
      setRejectionReason("");
    } catch (err) {
      console.error(err);
      setError("Network error while updating status.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-2">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Rejection Modal / Prompt */}
      {rejectingId && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-slate-700 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Decline Restaurant Registration</h3>
            <p className="text-xs text-slate-400 mb-4">
              Please provide a concise reason so the restaurant owner knows what information needs correction.
            </p>
            <textarea
              rows={3}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Incomplete restaurant address and unverified phone contact."
              className="w-full glass-input rounded-xl p-3 text-sm text-white placeholder-slate-500 focus:outline-none mb-4"
            />
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => {
                  setRejectingId(null);
                  setRejectionReason("");
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() =>
                  updateStatus(rejectingId, {
                    approvalStatus: ApprovalStatus.REJECTED,
                    rejectionReason: rejectionReason || "Does not satisfy verification criteria.",
                  })
                }
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition"
              >
                Confirm Rejection
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs and Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-xl border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setFilter("ALL")}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              filter === "ALL"
                ? "bg-slate-800 text-white font-semibold"
                : "text-slate-400 hover:text-white"
            }`}
          >
            All Restaurants ({restaurants.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("PENDING")}
            className={`px-3 py-1.5 rounded-lg font-medium transition flex items-center gap-1.5 cursor-pointer ${
              filter === "PENDING"
                ? "bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <span>Pending Vetting</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-slate-950 font-bold">
                {pendingCount}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilter("APPROVED")}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              filter === "APPROVED"
                ? "bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Approved ({approvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilter("SUSPENDED")}
            className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
              filter === "SUSPENDED"
                ? "bg-red-500/20 text-red-300 font-semibold border border-red-500/30"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Suspended ({suspendedCount})
          </button>
        </div>

        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, slug, owner..."
            className="w-full glass-input rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="glass-card rounded-2xl overflow-hidden border border-slate-800">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-900/80 text-xs font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4">Restaurant</th>
                <th className="px-6 py-4">Owner Info</th>
                <th className="px-6 py-4">Current Governance Status</th>
                <th className="px-6 py-4">Registered Date</th>
                <th className="px-6 py-4 text-right">Super Admin Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {filteredRestaurants.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-12 text-center text-slate-500">
                    No restaurants match the selected filter.
                  </td>
                </tr>
              ) : (
                filteredRestaurants.map((restaurant) => {
                  const owner = restaurant.members[0]?.user;
                  const isApproved = restaurant.approvalStatus === ApprovalStatus.APPROVED;
                  const isRejected = restaurant.approvalStatus === ApprovalStatus.REJECTED;
                  const isLoading = loadingId === restaurant.id;

                  return (
                    <tr key={restaurant.id} className="hover:bg-slate-900/40 transition">
                      <td className="px-6 py-4">
                        <div className="font-bold text-white">{restaurant.name}</div>
                        <div className="text-xs text-slate-400 font-mono">/r/{restaurant.slug}</div>
                        {restaurant.address && (
                          <div className="text-xs text-slate-400 mt-1 truncate max-w-xs">
                            {restaurant.address}
                          </div>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        {owner ? (
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-200">
                              <User className="w-3.5 h-3.5 text-slate-400" />
                              <span>{owner.name}</span>
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-slate-400">
                              <Mail className="w-3.5 h-3.5 text-slate-500" />
                              <span>{owner.email}</span>
                            </div>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-500">No owner assigned</span>
                        )}
                      </td>

                      <td className="px-6 py-4">
                        <div className="flex flex-col gap-1.5 items-start">
                          <ApprovalBadge status={restaurant.approvalStatus} />
                          <ActivationBadge isActive={restaurant.isActive} />
                          <SuspensionBadge isSuspended={restaurant.isSuspended} />
                          {restaurant.rejectionReason && (
                            <span className="text-[11px] text-rose-400/90 italic">
                              Reason: {restaurant.rejectionReason}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-xs text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-500" />
                          <span suppressHydrationWarning>{formatDate(restaurant.createdAt)}</span>
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {/* Approval / Re-approval */}
                          {!isApproved && (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() =>
                                updateStatus(restaurant.id, {
                                  approvalStatus: ApprovalStatus.APPROVED,
                                })
                              }
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 transition flex items-center gap-1 cursor-pointer"
                              title="Approve this restaurant"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Approve
                            </button>
                          )}

                          {/* Rejection */}
                          {!isRejected && (
                            <button
                              type="button"
                              disabled={isLoading}
                              onClick={() => setRejectingId(restaurant.id)}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-500/15 text-rose-300 border border-rose-500/30 hover:bg-rose-500/25 transition flex items-center gap-1 cursor-pointer"
                              title="Decline approval"
                            >
                              <X className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          )}

                          {/* Custom Subscription Pricing Button */}
                          <button
                            type="button"
                            onClick={() => openPricing(restaurant)}
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-300 border border-amber-500/30 hover:bg-amber-500/25 transition flex items-center gap-1 cursor-pointer"
                            title="Configure custom subscription pricing for this restaurant"
                          >
                            <Tag className="w-3.5 h-3.5 text-amber-400" />
                            <span>Pricing</span>
                          </button>

                          {/* Suspension toggle (Emergency safety killswitch) */}
                          <button
                            type="button"
                            disabled={isLoading}
                            onClick={() =>
                              updateStatus(restaurant.id, {
                                isSuspended: !restaurant.isSuspended,
                              })
                            }
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition flex items-center gap-1 cursor-pointer ${
                              restaurant.isSuspended
                                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30 hover:bg-cyan-500/25"
                                : "bg-red-900/30 text-red-300 border-red-700/40 hover:bg-red-900/50"
                            }`}
                            title={
                              restaurant.isSuspended
                                ? "Lift suspension"
                                : "Suspend restaurant from QR ordering"
                            }
                          >
                            {restaurant.isSuspended ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Unsuspend
                              </>
                            ) : (
                              <>
                                <ShieldAlert className="w-3.5 h-3.5" />
                                Suspend
                              </>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Custom Pricing Modal */}
      {pricingRestaurant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-lg glass-card rounded-2xl p-6 border border-slate-800 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" />
                <span>Custom Subscription Pricing</span>
              </h3>
              <button
                type="button"
                onClick={() => setPricingRestaurant(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="text-xs text-slate-300 bg-slate-900/80 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Restaurant</span>
                <strong className="text-white text-sm">{pricingRestaurant.name}</strong>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[10px] uppercase font-semibold">Slug</span>
                <span className="font-mono text-cyan-400">/r/{pricingRestaurant.slug}</span>
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

            {pricingLoading ? (
              <div className="py-8 text-center text-xs text-slate-400">
                Loading subscription details...
              </div>
            ) : (
              <form onSubmit={handleSavePricing} className="space-y-4">
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
                      onChange={(e) => setPricingPeriod(e.target.value as "MONTHLY" | "YEARLY")}
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
                      onChange={(e) => setPricingPaymentStatus(e.target.value as "PAID" | "PENDING" | "OVERDUE")}
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
                      onChange={(e) => setPricingSubStatus(e.target.value as "ACTIVE" | "SUSPENDED" | "EXPIRED")}
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
                    onClick={() => setPricingRestaurant(null)}
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
