"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  ShoppingBag,
  Calendar,
  Clock,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ChefHat,
  XCircle,
  ArrowRight,
  Filter,
  AlertTriangle,
  Banknote,
  Receipt,
  Layers,
  Ticket,
  Tag,
} from "lucide-react";
import { OrderAnalyticsResult } from "@/lib/analytics/service";
import { AnalyticsDatePreset, formatCurrencyINR } from "@/lib/analytics/dates";
import { OrderAnalyticsCharts } from "./OrderAnalyticsCharts";
import { OrderStatus } from "@prisma/client";

interface RestaurantOrderAnalyticsProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  initialData: OrderAnalyticsResult;
}

const PRESET_OPTIONS: Array<{ key: AnalyticsDatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7days", label: "Last 7 Days" },
  { key: "last30days", label: "Last 30 Days" },
  { key: "thismonth", label: "This Month" },
  { key: "lastmonth", label: "Last Month" },
  { key: "thisyear", label: "This Year" },
  { key: "custom", label: "Custom Date Range" },
];

export function RestaurantOrderAnalytics({
  restaurant,
  initialData,
}: RestaurantOrderAnalyticsProps) {
  const [data, setData] = useState<OrderAnalyticsResult>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activePreset, setActivePreset] = useState<AnalyticsDatePreset>(
    initialData.filter.preset
  );
  const [customStartDate, setCustomStartDate] = useState<string>(() => {
    return initialData.filter.startDate.slice(0, 10);
  });
  const [customEndDate, setCustomEndDate] = useState<string>(() => {
    return initialData.filter.endDate.slice(0, 10);
  });
  const [customError, setCustomError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);

  const fetchAnalytics = useCallback(
    async (
      preset: AnalyticsDatePreset,
      start?: string,
      end?: string
    ) => {
      setLoading(true);
      setError(null);
      try {
        let url = `/api/restaurants/${restaurant.id}/analytics?preset=${preset}`;
        if (preset === "custom" && start && end) {
          url += `&startDate=${encodeURIComponent(start)}&endDate=${encodeURIComponent(end)}`;
        }

        const res = await fetch(url);
        const json = await res.json();

        if (res.ok && json.success) {
          setData(json.data);
        } else {
          setError(json.error || "Failed to load order analytics.");
        }
      } catch {
        setError("Network error while updating analytics.");
      } finally {
        setLoading(false);
      }
    },
    [restaurant.id]
  );

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchAnalytics(activePreset, customStartDate, customEndDate);
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh, activePreset, customStartDate, customEndDate, fetchAnalytics]);

  function handleSelectPreset(preset: AnalyticsDatePreset) {
    setActivePreset(preset);
    setCustomError(null);
    if (preset !== "custom") {
      fetchAnalytics(preset);
    }
  }

  function handleApplyCustomRange() {
    if (!customStartDate || !customEndDate) {
      setCustomError("Please select both start and end dates.");
      return;
    }
    if (customStartDate > customEndDate) {
      setCustomError("Start date cannot be after end date.");
      return;
    }
    setCustomError(null);
    fetchAnalytics("custom", customStartDate, customEndDate);
  }

  const { summary, periodTotals, statusBreakdown, charts, filter } = data;

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.SUBMITTED:
        return <Clock className="w-4 h-4 text-amber-400" />;
      case OrderStatus.CONFIRMED:
        return <CheckCircle2 className="w-4 h-4 text-blue-400" />;
      case OrderStatus.PREPARING:
        return <ChefHat className="w-4 h-4 text-purple-400" />;
      case OrderStatus.SERVED:
        return <CheckCircle2 className="w-4 h-4 text-emerald-400" />;
      case OrderStatus.COMPLETED:
        return <CheckCircle2 className="w-4 h-4 text-teal-400" />;
      case OrderStatus.CANCELLED:
        return <XCircle className="w-4 h-4 text-rose-400" />;
    }
  };

  const getStatusBadgeColor = (status: OrderStatus) => {
    switch (status) {
      case OrderStatus.SUBMITTED:
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      case OrderStatus.CONFIRMED:
        return "bg-blue-500/10 text-blue-300 border-blue-500/20";
      case OrderStatus.PREPARING:
        return "bg-purple-500/10 text-purple-300 border-purple-500/20";
      case OrderStatus.SERVED:
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
      case OrderStatus.COMPLETED:
        return "bg-teal-500/10 text-teal-300 border-teal-500/20";
      case OrderStatus.CANCELLED:
        return "bg-rose-500/10 text-rose-400 border-rose-500/20";
    }
  };

  return (
    <div className="space-y-8">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Restaurant Order & Sales Analytics
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
              {restaurant.name}
            </span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono text-slate-400 bg-slate-900 border border-slate-800">
              IST (UTC+05:30)
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cash-at-counter order analytics. Authoritative sales and volume reporting based on actual database orders.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/20"
            />
            <span>Auto-refresh</span>
          </label>

          <button
            type="button"
            onClick={() => fetchAnalytics(activePreset, customStartDate, customEndDate)}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition cursor-pointer disabled:opacity-50"
            title="Refresh analytics data"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin text-amber-400" : ""}`} />
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchAnalytics(activePreset, customStartDate, customEndDate)}
            className="font-bold underline cursor-pointer hover:text-rose-200"
          >
            Retry
          </button>
        </div>
      )}

      {/* Section 1: Executive Summary Cards (Today, Monthly, Yearly Sales & Orders) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
            <span>Sales & Orders Overview</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Timezone: Asia/Kolkata (IST)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Card 1: Today */}
          <div className="glass-card rounded-3xl p-5 border border-slate-800 hover:border-slate-700/80 transition space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Today</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/20">
                {summary.today.ordersCount ?? summary.today.totalOrders} Orders
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Today&apos;s Sales
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                {formatCurrencyINR(summary.today.sales ?? summary.today.totalOrderValue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Excludes {summary.today.cancelledOrders} cancelled order{summary.today.cancelledOrders === 1 ? "" : "s"}
              </p>
              {Boolean(summary.today.taxAmount && summary.today.taxAmount > 0) && (
                <div className="text-[10px] text-amber-300 font-mono mt-1">
                  Tax: {formatCurrencyINR(summary.today.taxAmount)} • Net: {formatCurrencyINR(summary.today.netSales)}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Completed Sales:</span>
                <span className="font-mono font-bold text-teal-400">
                  {formatCurrencyINR(summary.today.completedSales ?? summary.today.completedOrderValue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Completed Orders:</span>
                <span className="font-mono text-slate-400">{summary.today.completedOrders} fulfilled</span>
              </div>
            </div>
          </div>

          {/* Card 2: This Month (Monthly) */}
          <div className="glass-card rounded-3xl p-5 border border-slate-800 hover:border-slate-700/80 transition space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Banknote className="w-3.5 h-3.5" />
                <span>Monthly</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                {summary.thisMonth.ordersCount ?? summary.thisMonth.totalOrders} Orders
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Monthly Sales
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                {formatCurrencyINR(summary.thisMonth.sales ?? summary.thisMonth.totalOrderValue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Excludes {summary.thisMonth.cancelledOrders} cancelled order{summary.thisMonth.cancelledOrders === 1 ? "" : "s"}
              </p>
              {Boolean(summary.thisMonth.taxAmount && summary.thisMonth.taxAmount > 0) && (
                <div className="text-[10px] text-amber-300 font-mono mt-1">
                  Tax: {formatCurrencyINR(summary.thisMonth.taxAmount)} • Net: {formatCurrencyINR(summary.thisMonth.netSales)}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Completed Sales:</span>
                <span className="font-mono font-bold text-teal-400">
                  {formatCurrencyINR(summary.thisMonth.completedSales ?? summary.thisMonth.completedOrderValue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Completed Orders:</span>
                <span className="font-mono text-slate-400">{summary.thisMonth.completedOrders} fulfilled</span>
              </div>
            </div>
          </div>

          {/* Card 3: This Year (Yearly) */}
          <div className="glass-card rounded-3xl p-5 border border-slate-800 hover:border-slate-700/80 transition space-y-4 sm:col-span-2 lg:col-span-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Yearly</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                {summary.thisYear.ordersCount ?? summary.thisYear.totalOrders} Orders
              </span>
            </div>

            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Yearly Sales
              </div>
              <div className="text-2xl sm:text-3xl font-extrabold text-white font-mono">
                {formatCurrencyINR(summary.thisYear.sales ?? summary.thisYear.totalOrderValue)}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Excludes {summary.thisYear.cancelledOrders} cancelled order{summary.thisYear.cancelledOrders === 1 ? "" : "s"}
              </p>
              {Boolean(summary.thisYear.taxAmount && summary.thisYear.taxAmount > 0) && (
                <div className="text-[10px] text-amber-300 font-mono mt-1">
                  Tax: {formatCurrencyINR(summary.thisYear.taxAmount)} • Net: {formatCurrencyINR(summary.thisYear.netSales)}
                </div>
              )}
            </div>

            <div className="pt-3 border-t border-slate-800/80 space-y-1 text-xs text-slate-400">
              <div className="flex items-center justify-between">
                <span>Completed Sales:</span>
                <span className="font-mono font-bold text-teal-400">
                  {formatCurrencyINR(summary.thisYear.completedSales ?? summary.thisYear.completedOrderValue)}
                </span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Completed Orders:</span>
                <span className="font-mono text-slate-400">{summary.thisYear.completedOrders} fulfilled</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Date Range Filter Bar */}
      <div className="glass-card rounded-3xl p-5 sm:p-6 border border-slate-800 space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-white">
              Filter by Period
            </span>
            <span className="text-xs text-slate-400 font-mono">
              ({filter.label})
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {PRESET_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => handleSelectPreset(opt.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  activePreset === opt.key
                    ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-md shadow-amber-500/10 font-bold"
                    : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {activePreset === "custom" && (
          <div className="pt-3 border-t border-slate-800/80 flex flex-col sm:flex-row items-center gap-3">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400">From:</span>
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 w-full sm:w-auto"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs text-slate-400">To:</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-amber-400 w-full sm:w-auto"
              />
            </div>

            <button
              type="button"
              onClick={handleApplyCustomRange}
              disabled={loading}
              className="w-full sm:w-auto px-4 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1 shadow-sm disabled:opacity-50"
            >
              <span>Apply Filter</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>

            {customError && (
              <span className="text-xs text-rose-400 font-medium">{customError}</span>
            )}
          </div>
        )}
      </div>

      {/* Section 3: Period Sales & Order Performance Metrics */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5 text-amber-400" />
            <span>Period Order & Sales Metrics ({filter.label})</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            Authoritative Server Calculations
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Gross Sales */}
          <div className="glass-card rounded-2xl p-4 border border-emerald-500/20 bg-emerald-500/5 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-emerald-400 block uppercase tracking-wider truncate">
              Gross Sales
            </span>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-emerald-400 tracking-tight truncate"
              title={formatCurrencyINR(periodTotals.totalSales)}
            >
              {formatCurrencyINR(periodTotals.totalSales)}
            </div>
            <p className="text-[10px] text-emerald-300/70 truncate">Sum of non-cancelled orders</p>
          </div>

          {/* 2. GST / Tax Collected */}
          <div className="glass-card rounded-2xl p-4 border border-amber-500/20 bg-amber-500/5 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-amber-400 block uppercase tracking-wider truncate">
              GST / Tax
            </span>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-amber-400 tracking-tight truncate"
              title={formatCurrencyINR(periodTotals.totalTaxAmount ?? 0)}
            >
              {formatCurrencyINR(periodTotals.totalTaxAmount ?? 0)}
            </div>
            <p className="text-[10px] text-amber-300/70 truncate">Tax collected on valid orders</p>
          </div>

          {/* 3. Sales Excl. Tax (Net) */}
          <div className="glass-card rounded-2xl p-4 border border-cyan-500/20 bg-cyan-500/5 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-cyan-400 block uppercase tracking-wider truncate">
              Sales Excl. Tax
            </span>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-cyan-400 tracking-tight truncate"
              title={formatCurrencyINR(periodTotals.netSales ?? (periodTotals.totalSales - (periodTotals.totalTaxAmount ?? 0)))}
            >
              {formatCurrencyINR(periodTotals.netSales ?? (periodTotals.totalSales - (periodTotals.totalTaxAmount ?? 0)))}
            </div>
            <p className="text-[10px] text-cyan-300/70 truncate">Taxable amount before GST</p>
          </div>

          {/* 4. Average Order Value (AOV) */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider truncate">
              Average Order Value
            </span>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-white tracking-tight truncate"
              title={formatCurrencyINR(periodTotals.averageOrderValue)}
            >
              {formatCurrencyINR(periodTotals.averageOrderValue)}
            </div>
            <p className="text-[10px] text-slate-500 truncate">Average sales per valid order</p>
          </div>

          {/* 5. Total Orders */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider truncate">
              Total Orders
            </span>
            <div className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-white tracking-tight">
              {periodTotals.totalOrders}
            </div>
            <p className="text-[10px] text-slate-500 truncate">All placed dining orders in period</p>
          </div>

          {/* 6. Completed Orders */}
          <div className="glass-card rounded-2xl p-4 border border-slate-800 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-slate-400 block uppercase tracking-wider truncate">
              Completed Orders
            </span>
            <div className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-teal-300 tracking-tight">
              {periodTotals.completedOrders}
            </div>
            <p className="text-[10px] text-slate-500 truncate">Fulfilled dining orders (COMPLETED)</p>
          </div>

          {/* 7. Completed Sales */}
          <div className="glass-card rounded-2xl p-4 border border-teal-500/20 bg-teal-500/5 space-y-1 min-w-0">
            <span className="text-[11px] font-semibold text-teal-400 block uppercase tracking-wider truncate">
              Completed Sales
            </span>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-teal-400 tracking-tight truncate"
              title={formatCurrencyINR(periodTotals.completedSales)}
            >
              {formatCurrencyINR(periodTotals.completedSales)}
            </div>
            <p className="text-[10px] text-teal-300/70 truncate">Sales from fulfilled dining orders</p>
          </div>

          {/* 8. Cancelled Orders */}
          <div className="glass-card rounded-2xl p-4 border border-rose-500/20 bg-rose-500/5 space-y-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-rose-300 block uppercase tracking-wider truncate">
                Cancelled Orders
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-rose-500/20 text-rose-400 flex-shrink-0">
                Excluded
              </span>
            </div>
            <div className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-rose-400 tracking-tight">
              {periodTotals.cancelledOrders}
            </div>
            <p className="text-[10px] text-rose-300/70 truncate">
              Strictly excluded from sales calculations
            </p>
          </div>

          {/* 9. Coupon Discounts */}
          <div className="glass-card rounded-2xl p-4 border border-purple-500/20 bg-purple-500/5 space-y-1 min-w-0 sm:col-span-2 lg:col-span-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold text-purple-400 block uppercase tracking-wider truncate flex items-center gap-1.5">
                <Ticket className="w-3.5 h-3.5 text-purple-400" />
                <span>Coupon Discounts Given</span>
              </span>
              <span className="text-[11px] text-purple-300 font-mono">
                {periodTotals.couponOrdersCount ?? 0} orders discounted
              </span>
            </div>
            <div
              className="text-lg sm:text-xl lg:text-2xl font-extrabold font-mono text-purple-300 tracking-tight"
              title={formatCurrencyINR(periodTotals.totalDiscountAmount ?? 0)}
            >
              {formatCurrencyINR(periodTotals.totalDiscountAmount ?? 0)}
            </div>
            <p className="text-[10px] text-purple-300/70">
              Total promotional discounts deducted from valid orders in this period (excluding cancelled orders)
            </p>
          </div>
        </div>
      </div>

      {/* Section 4: Period Order Status Pipeline */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
            <Layers className="w-3.5 h-3.5 text-amber-400" />
            <span>Order Pipeline & Status Breakdown ({filter.label})</span>
          </h2>
          <span className="text-[11px] text-slate-500 font-mono">
            All 6 Authoritative Prisma Enums
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {statusBreakdown.map((sb) => {
            const badgeColor = getStatusBadgeColor(sb.status);
            const isCancelled = sb.status === OrderStatus.CANCELLED;

            return (
              <div
                key={sb.status}
                className="glass-card rounded-2xl p-4 border border-slate-800 space-y-2 hover:border-slate-700/80 transition"
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${badgeColor}`}
                  >
                    {sb.label}
                  </span>
                  {getStatusIcon(sb.status)}
                </div>

                <div>
                  <div className="text-xl sm:text-2xl font-black font-mono text-white">
                    {sb.count}
                  </div>
                  <div className="text-[11px] font-mono mt-0.5 truncate">
                    {isCancelled ? (
                      <span className="text-slate-500 italic">Excluded from sales</span>
                    ) : (
                      <span className="text-slate-400">{formatCurrencyINR(sb.orderValue ?? sb.revenue)}</span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 4b: Top Redeemed Coupons in Period */}
      {data.topCoupons && data.topCoupons.length > 0 && (
        <div className="glass-card rounded-3xl p-5 sm:p-6 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Ticket className="w-3.5 h-3.5 text-purple-400" />
              <span>Top Redeemed Coupons in Period ({filter.label})</span>
            </h2>
            <span className="text-[11px] text-slate-500 font-mono">
              Excludes cancelled orders
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.topCoupons.map((coupon) => (
              <div
                key={coupon.code}
                className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800/80 flex items-center justify-between gap-3"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-purple-400" />
                    <span className="font-mono font-bold text-xs text-white uppercase">
                      {coupon.code}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {coupon.count} order{coupon.count === 1 ? "" : "s"} discounted
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold font-mono text-purple-300">
                    {formatCurrencyINR(coupon.totalDiscount)}
                  </span>
                  <span className="block text-[10px] text-slate-500">total discount</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Section 5: Interactive Visual Charts */}
      <OrderAnalyticsCharts
        dailyData={charts.daily}
        monthlyData={charts.monthly}
        yearlyData={charts.yearly}
        currentPresetLabel={filter.label}
      />

      {/* Section 6: Cash-at-Counter Business Model Notice */}
      <div className="p-5 rounded-3xl bg-slate-900/90 border border-slate-800 text-xs text-slate-300 space-y-3 leading-relaxed">
        <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>Cash-at-Counter Model & Sales Accounting Standards</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-400 text-[11px]">
          <div>
            <strong className="text-slate-200 block mb-1">
              Counter Service & Cash Payments:
            </strong>
            In QRServe&apos;s counter-service dining model, customers place orders directly from table QR codes,
            and complete payment at the billing counter (via cash, UPI QR, or POS card terminal).
            There is no online payment-pending workflow or gateway tracking required for this business model.
          </div>
          <div>
            <strong className="text-slate-200 block mb-1">
              Authoritative Sales Calculations:
            </strong>
            All sales figures are calculated server-side from actual database orders.
            <strong> Cancelled orders</strong> are strictly excluded from sales calculations.
            Because payments are received directly at the physical counter, figures reflect valid
            <strong> Order Sales</strong> rather than assumed cash collections.
          </div>
        </div>
      </div>
    </div>
  );
}
