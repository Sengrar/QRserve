"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import {
  Ticket,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  Users,
  Edit2,
  Trash2,
  AlertCircle,
  Loader2,
  X,
  TrendingUp,
  Tag,
  ChevronRight,
} from "lucide-react";
import { CouponDiscountType } from "@prisma/client";

export interface AdminCouponData {
  id: string;
  code: string;
  description: string | null;
  discountType: CouponDiscountType;
  discountValue: number;
  minOrderSubtotal: number;
  maxDiscount: number | null;
  startDate: string | null;
  endDate: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  orderCount?: number;
}

interface RestaurantCouponManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  initialCoupons: AdminCouponData[];
  stats: {
    totalDiscountGiven: number;
    couponOrdersCount: number;
  };
}

// Converts ISO date string to YYYY-MM-DDTHH:mm in local time for datetime-local input
function toDateTimeLocalString(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// Enforces 4-digit year format (between 2020 and 2099) and prevents 5+ or 6-digit year typing
function sanitizeDateTimeInput(value: string): string {
  if (!value) return "";
  const parts = value.split("-");
  if (parts.length >= 3 && parts[0].length > 4) {
    const year = parts[0].slice(0, 4);
    return [year, ...parts.slice(1)].join("-");
  }
  return value;
}

// Converts form input value to ISO string or null with 4-digit year enforcement
function toISOStringOrNull(value: string): string | null {
  if (!value || !value.trim()) return null;
  const sanitized = sanitizeDateTimeInput(value.trim());
  const d = new Date(sanitized);
  if (isNaN(d.getTime())) return null;
  const year = d.getFullYear();
  if (year < 2020 || year > 2099) return null;
  return d.toISOString();
}

// Formats display date cleanly
function formatDisplayDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Now";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "Now";
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function RestaurantCouponManager({
  restaurant,
  initialCoupons,
  stats: initialStats,
}: RestaurantCouponManagerProps) {
  const [coupons, setCoupons] = useState<AdminCouponData[]>(initialCoupons);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "PERCENTAGE" | "FIXED">("ALL");

  // Modal State
  const [modalMode, setModalMode] = useState<"CREATE" | "EDIT" | null>(null);
  const [editingCoupon, setEditingCoupon] = useState<AdminCouponData | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form Fields
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<CouponDiscountType>("PERCENTAGE");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formMinOrderSubtotal, setFormMinOrderSubtotal] = useState("0");
  const [formMaxDiscount, setFormMaxDiscount] = useState("");
  const [formStartDate, setFormStartDate] = useState("");
  const [formEndDate, setFormEndDate] = useState("");
  const [formUsageLimit, setFormUsageLimit] = useState("");
  const [formPerCustomerLimit, setFormPerCustomerLimit] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  // Quick Action States
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Open Create Modal
  function handleOpenCreate() {
    setModalMode("CREATE");
    setEditingCoupon(null);
    setFormCode("");
    setFormDescription("");
    setFormDiscountType("PERCENTAGE");
    setFormDiscountValue("");
    setFormMinOrderSubtotal("0");
    setFormMaxDiscount("");
    setFormStartDate("");
    setFormEndDate("");
    setFormUsageLimit("");
    setFormPerCustomerLimit("");
    setFormIsActive(true);
    setModalError(null);
  }

  // Open Edit Modal
  function handleOpenEdit(coupon: AdminCouponData) {
    setModalMode("EDIT");
    setEditingCoupon(coupon);
    setFormCode(coupon.code);
    setFormDescription(coupon.description || "");
    setFormDiscountType(coupon.discountType);
    setFormDiscountValue(String(coupon.discountValue));
    setFormMinOrderSubtotal(String(coupon.minOrderSubtotal ?? 0));
    setFormMaxDiscount(coupon.maxDiscount !== null && coupon.maxDiscount !== undefined ? String(coupon.maxDiscount) : "");
    setFormStartDate(toDateTimeLocalString(coupon.startDate));
    setFormEndDate(toDateTimeLocalString(coupon.endDate));
    setFormUsageLimit(coupon.usageLimit !== null && coupon.usageLimit !== undefined ? String(coupon.usageLimit) : "");
    setFormPerCustomerLimit(coupon.perCustomerLimit !== null && coupon.perCustomerLimit !== undefined ? String(coupon.perCustomerLimit) : "");
    setFormIsActive(coupon.isActive);
    setModalError(null);
  }

  // Close Modal
  function handleCloseModal() {
    setModalMode(null);
    setEditingCoupon(null);
    setModalError(null);
  }

  // Copy Code
  function handleCopy(code: string) {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  // Toggle Active State
  async function handleToggleActive(coupon: AdminCouponData) {
    setTogglingId(coupon.id);
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/coupons/${coupon.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !coupon.isActive }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setCoupons((prev) =>
          prev.map((c) => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c))
        );
      } else {
        alert(json.error || "Failed to update coupon status.");
      }
    } catch {
      alert("Network error while updating coupon status.");
    } finally {
      setTogglingId(null);
    }
  }

  // Delete / Deactivate Coupon
  async function handleDelete(coupon: AdminCouponData) {
    if (!confirm(`Are you sure you want to delete or deactivate coupon "${coupon.code}"?`)) {
      return;
    }
    setDeletingId(coupon.id);
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/coupons/${coupon.id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (res.ok && json.success) {
        if (json.action === "DEACTIVATED") {
          setCoupons((prev) =>
            prev.map((c) => (c.id === coupon.id ? { ...c, isActive: false } : c))
          );
          alert(`Coupon "${coupon.code}" has associated orders, so it was safely deactivated instead of deleted.`);
        } else {
          setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
        }
      } else {
        alert(json.error || "Failed to delete coupon.");
      }
    } catch {
      alert("Network error while deleting coupon.");
    } finally {
      setDeletingId(null);
    }
  }

  // Form Submit
  async function handleSubmitForm(e: React.FormEvent) {
    e.preventDefault();
    setIsSubmitting(true);
    setModalError(null);

    const payload = {
      code: formCode.trim().toUpperCase(),
      description: formDescription.trim() || undefined,
      discountType: formDiscountType,
      discountValue: parseFloat(formDiscountValue),
      minOrderSubtotal: parseFloat(formMinOrderSubtotal) || 0,
      maxDiscount: formDiscountType === "PERCENTAGE" && formMaxDiscount ? parseFloat(formMaxDiscount) : null,
      startDate: toISOStringOrNull(formStartDate),
      endDate: toISOStringOrNull(formEndDate),
      usageLimit: formUsageLimit ? parseInt(formUsageLimit, 10) : null,
      perCustomerLimit: formPerCustomerLimit ? parseInt(formPerCustomerLimit, 10) : null,
      isActive: formIsActive,
    };

    try {
      const url =
        modalMode === "CREATE"
          ? `/api/restaurants/${restaurant.id}/coupons`
          : `/api/restaurants/${restaurant.id}/coupons/${editingCoupon!.id}`;
      const method = modalMode === "CREATE" ? "POST" : "PATCH";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        setModalError(json.error || "Failed to save coupon.");
        setIsSubmitting(false);
        return;
      }

      const rawSaved = json.data;
      const saved: AdminCouponData = {
        id: rawSaved.id,
        code: rawSaved.code,
        description: rawSaved.description ?? null,
        discountType: rawSaved.discountType,
        discountValue: Number(rawSaved.discountValue),
        minOrderSubtotal: Number(rawSaved.minOrderSubtotal ?? 0),
        maxDiscount: rawSaved.maxDiscount !== null && rawSaved.maxDiscount !== undefined ? Number(rawSaved.maxDiscount) : null,
        startDate: rawSaved.startDate ?? null,
        endDate: rawSaved.endDate ?? null,
        usageLimit: rawSaved.usageLimit ?? null,
        usageCount: rawSaved.usageCount ?? 0,
        perCustomerLimit: rawSaved.perCustomerLimit ?? null,
        isActive: Boolean(rawSaved.isActive),
        createdAt: rawSaved.createdAt ?? new Date().toISOString(),
        updatedAt: rawSaved.updatedAt ?? new Date().toISOString(),
        orderCount: rawSaved.orderCount ?? 0,
      };

      if (modalMode === "CREATE") {
        setCoupons((prev) => [saved, ...prev]);
      } else {
        setCoupons((prev) => prev.map((c) => (c.id === saved.id ? { ...c, ...saved } : c)));
      }

      handleCloseModal();
    } catch {
      setModalError("Network error while saving coupon. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  // Filtered coupons
  const filteredCoupons = useMemo(() => {
    return coupons.filter((c) => {
      // Text search
      if (search.trim()) {
        const term = search.toLowerCase();
        const matchesCode = c.code.toLowerCase().includes(term);
        const matchesDesc = c.description?.toLowerCase().includes(term);
        if (!matchesCode && !matchesDesc) return false;
      }

      // Status
      if (statusFilter === "ACTIVE" && !c.isActive) return false;
      if (statusFilter === "INACTIVE" && c.isActive) return false;

      // Type
      if (typeFilter !== "ALL" && c.discountType !== typeFilter) return false;

      return true;
    });
  }, [coupons, search, statusFilter, typeFilter]);

  const activeCount = useMemo(() => coupons.filter((c) => c.isActive).length, [coupons]);
  const totalRedemptions = useMemo(
    () => coupons.reduce((sum, c) => sum + (c.usageCount ?? 0), 0),
    [coupons]
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 text-slate-100">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard" className="hover:text-amber-400 transition">
              Restaurants
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link href={`/restaurants/${restaurant.id}/orders`} className="hover:text-amber-400 transition">
              {restaurant.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-amber-400 font-semibold">Coupons & Offers</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
            <Ticket className="w-7 h-7 text-amber-400" />
            <span>Offers & Coupons</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Create and manage promotional discounts, customer redemption limits, and validity rules.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-lg shadow-amber-500/20 active:scale-95 transition cursor-pointer flex-shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Coupon</span>
        </button>
      </div>

      {/* Metric Cards Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Coupons</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Tag className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">{coupons.length}</span>
            <span className="text-[11px] text-slate-400">promos created</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Active Coupons</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">{activeCount}</span>
            <span className="text-[11px] text-slate-400">live now</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Redemptions</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-white font-mono">{totalRedemptions}</span>
            <span className="text-[11px] text-slate-400">orders discounted</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 shadow-md">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Total Discount Given</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-purple-300 font-mono">
              ₹{(initialStats?.totalDiscountGiven ?? 0).toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="p-3 sm:p-4 rounded-2xl bg-slate-900/70 border border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search coupon code or description..."
            className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto no-scrollbar">
          {/* Status Filter */}
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setStatusFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === "ALL" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              All
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("ACTIVE")}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === "ACTIVE" ? "bg-emerald-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Active
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter("INACTIVE")}
              className={`px-2.5 py-1 rounded-lg transition ${
                statusFilter === "INACTIVE" ? "bg-slate-700 text-white font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              Inactive
            </button>
          </div>

          {/* Type Filter */}
          <div className="flex rounded-xl bg-slate-950 p-1 border border-slate-800 text-xs font-medium">
            <button
              type="button"
              onClick={() => setTypeFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg transition ${
                typeFilter === "ALL" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              All Types
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("PERCENTAGE")}
              className={`px-2.5 py-1 rounded-lg transition ${
                typeFilter === "PERCENTAGE" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              % Off
            </button>
            <button
              type="button"
              onClick={() => setTypeFilter("FIXED")}
              className={`px-2.5 py-1 rounded-lg transition ${
                typeFilter === "FIXED" ? "bg-amber-400 text-slate-950 font-bold" : "text-slate-400 hover:text-white"
              }`}
            >
              ₹ Flat
            </button>
          </div>
        </div>
      </div>

      {/* Coupons List / Grid */}
      {filteredCoupons.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-slate-900/40 border border-slate-800/80 space-y-3">
          <Ticket className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-white">No Coupons Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            {coupons.length === 0
              ? "You haven't created any promotional coupons yet. Create your first coupon to reward dining guests!"
              : "No coupons matched your current search and filter criteria."}
          </p>
          {coupons.length === 0 && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleOpenCreate}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-amber-400 text-slate-950 hover:bg-amber-300 transition"
              >
                Create First Coupon
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredCoupons.map((coupon) => {
            const isExpired = coupon.endDate
              ? !isNaN(new Date(coupon.endDate).getTime()) && new Date(coupon.endDate) < new Date()
              : false;
            const isNotStarted = coupon.startDate
              ? !isNaN(new Date(coupon.startDate).getTime()) && new Date(coupon.startDate) > new Date()
              : false;
            const isExhausted = coupon.usageLimit
              ? (coupon.usageCount ?? 0) >= coupon.usageLimit
              : false;

            return (
              <div
                key={coupon.id}
                className={`relative rounded-3xl p-5 border transition-all duration-200 flex flex-col justify-between space-y-4 ${
                  !coupon.isActive || isExpired || isExhausted
                    ? "bg-slate-900/40 border-slate-800/60 opacity-80"
                    : "bg-slate-900/90 border-slate-800 hover:border-amber-500/40 shadow-xl shadow-black/20"
                }`}
              >
                {/* Card Top: Code, Type Badge & Active Toggle */}
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="px-3 py-1.5 rounded-xl bg-slate-950 border border-amber-500/30 flex items-center gap-2">
                        <span className="font-mono font-black text-sm tracking-wider text-amber-300 uppercase">
                          {coupon.code}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopy(coupon.code)}
                          className="p-1 rounded text-slate-400 hover:text-amber-400 transition"
                          title="Copy Code"
                        >
                          {copiedCode === coupon.code ? (
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>

                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          coupon.discountType === "PERCENTAGE"
                            ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                            : "bg-purple-500/10 text-purple-400 border-purple-500/30"
                        }`}
                      >
                        {coupon.discountType === "PERCENTAGE"
                          ? `${coupon.discountValue}% OFF`
                          : `₹${coupon.discountValue} FLAT OFF`}
                      </span>
                    </div>

                    {/* Status Pill */}
                    <span
                      className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full border ${
                        !coupon.isActive
                          ? "bg-slate-800 text-slate-400 border-slate-700"
                          : isExpired
                          ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                          : isExhausted
                          ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                          : isNotStarted
                          ? "bg-blue-500/10 text-blue-400 border-blue-500/30"
                          : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {!coupon.isActive
                        ? "Inactive"
                        : isExpired
                        ? "Expired"
                        : isExhausted
                        ? "Exhausted"
                        : isNotStarted
                        ? "Scheduled"
                        : "Active"}
                    </span>
                  </div>

                  {/* Description */}
                  {coupon.description && (
                    <p className="text-xs text-slate-300 mt-2 line-clamp-2">
                      {coupon.description}
                    </p>
                  )}
                </div>

                {/* Rules & Limits */}
                <div className="space-y-1.5 text-xs text-slate-400 border-t border-dashed border-slate-800 pt-3">
                  <div className="flex justify-between items-center">
                    <span>Min Order Subtotal:</span>
                    <span className="font-mono text-slate-200">
                      ₹{(coupon.minOrderSubtotal ?? 0).toFixed(2)}
                    </span>
                  </div>

                  {coupon.discountType === "PERCENTAGE" && coupon.maxDiscount !== null && coupon.maxDiscount !== undefined && (
                    <div className="flex justify-between items-center">
                      <span>Max Discount Cap:</span>
                      <span className="font-mono text-slate-200">
                        ₹{Number(coupon.maxDiscount).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center">
                    <span>Redemptions:</span>
                    <span className="font-mono text-slate-200">
                      {coupon.usageCount ?? 0}
                      {coupon.usageLimit ? ` / ${coupon.usageLimit}` : " (unlimited)"}
                    </span>
                  </div>

                  {coupon.perCustomerLimit && (
                    <div className="flex justify-between items-center">
                      <span>Per-Customer Limit:</span>
                      <span className="font-mono text-slate-200">
                        {coupon.perCustomerLimit} per customer
                      </span>
                    </div>
                  )}

                  {(coupon.startDate || coupon.endDate) && (
                    <div className="flex justify-between items-center text-[11px] pt-1">
                      <span>Validity:</span>
                      <span className="text-slate-300">
                        {coupon.startDate ? formatDisplayDate(coupon.startDate) : "Now"}
                        {" → "}
                        {coupon.endDate ? formatDisplayDate(coupon.endDate) : "Never"}
                      </span>
                    </div>
                  )}
                </div>

                {/* Card Actions Footer */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => handleToggleActive(coupon)}
                    disabled={togglingId === coupon.id}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                      coupon.isActive
                        ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                        : "bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30"
                    }`}
                  >
                    {togglingId === coupon.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : coupon.isActive ? (
                      <XCircle className="w-3.5 h-3.5 text-slate-400" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>{coupon.isActive ? "Deactivate" : "Activate"}</span>
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(coupon)}
                      className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                      title="Edit Coupon"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(coupon)}
                      disabled={deletingId === coupon.id}
                      className="p-2 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition cursor-pointer"
                      title="Delete / Deactivate Coupon"
                    >
                      {deletingId === coupon.id ? (
                        <Loader2 className="w-4 h-4 animate-spin text-rose-400" />
                      ) : (
                        <Trash2 className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      {modalMode && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto"
        >
          <div className="relative max-w-lg w-full bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 my-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  {modalMode === "CREATE" ? "Create New Coupon" : `Edit Coupon: ${editingCoupon?.code}`}
                </h3>
              </div>
              <button
                type="button"
                onClick={handleCloseModal}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3.5 text-xs">
              {/* Code & Discount Type */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    Coupon Code <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value.toUpperCase())}
                    placeholder="e.g. WELCOME20"
                    maxLength={30}
                    className="w-full text-xs font-mono uppercase bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    Discount Type <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={formDiscountType}
                    onChange={(e) => setFormDiscountType(e.target.value as CouponDiscountType)}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="PERCENTAGE">Percentage (%) Off</option>
                    <option value="FIXED">Fixed Amount (₹) Off</option>
                  </select>
                </div>
              </div>

              {/* Discount Value & Max Discount */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    {formDiscountType === "PERCENTAGE" ? "Percentage Value (%)" : "Flat Amount (₹)"}{" "}
                    <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max={formDiscountType === "PERCENTAGE" ? 100 : 100000}
                    required
                    value={formDiscountValue}
                    onChange={(e) => setFormDiscountValue(e.target.value)}
                    placeholder={formDiscountType === "PERCENTAGE" ? "e.g. 20" : "e.g. 150"}
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    {formDiscountType === "PERCENTAGE" ? "Max Discount Cap (₹)" : "N/A for Fixed"}
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={formDiscountType !== "PERCENTAGE"}
                    value={formMaxDiscount}
                    onChange={(e) => setFormMaxDiscount(e.target.value)}
                    placeholder="Optional (e.g. 100)"
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400 disabled:opacity-40"
                  />
                </div>
              </div>

              {/* Min Order Subtotal */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">
                  Minimum Order Subtotal (₹)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formMinOrderSubtotal}
                  onChange={(e) => setFormMinOrderSubtotal(e.target.value)}
                  placeholder="0 (no minimum)"
                  className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Description */}
              <div className="space-y-1">
                <label className="font-semibold text-slate-300 block">Public Description</label>
                <input
                  type="text"
                  maxLength={255}
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="e.g. 20% off up to ₹100 on orders above ₹300"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              {/* Validity Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">Start Date / Time</label>
                  <input
                    type="datetime-local"
                    min="2020-01-01T00:00"
                    max="2099-12-31T23:59"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(sanitizeDateTimeInput(e.target.value))}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">Expiry Date / Time</label>
                  <input
                    type="datetime-local"
                    min="2020-01-01T00:00"
                    max="2099-12-31T23:59"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(sanitizeDateTimeInput(e.target.value))}
                    className="w-full text-xs bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    Total Global Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formUsageLimit}
                    onChange={(e) => setFormUsageLimit(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-slate-300 block">
                    Per-Customer Usage Limit
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={formPerCustomerLimit}
                    onChange={(e) => setFormPerCustomerLimit(e.target.value)}
                    placeholder="Unlimited"
                    className="w-full text-xs font-mono bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="couponActiveCheckbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-400"
                />
                <label htmlFor="couponActiveCheckbox" className="text-xs font-medium text-slate-300 cursor-pointer">
                  Activate coupon immediately upon saving
                </label>
              </div>

              {/* Submit Buttons */}
              <div className="flex gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 text-slate-300 hover:bg-slate-700 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 text-slate-950 shadow-md transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <span>{modalMode === "CREATE" ? "Create Coupon" : "Update Coupon"}</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
