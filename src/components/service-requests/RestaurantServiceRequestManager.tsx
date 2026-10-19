"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Bell,
  Droplet,
  UtensilsCrossed,
  Sparkles,
  MessageSquare,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Check,
  XCircle,
  QrCode,
  ChevronRight,
} from "lucide-react";
import { useRestaurantNotifications } from "@/context/RestaurantNotificationContext";

export interface ServiceRequestItem {
  id: string;
  restaurantId: string;
  tableId: string;
  type: "CALL_WAITER" | "WATER" | "CUTLERY" | "CLEANING" | "OTHER";
  status: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";
  message: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  table: {
    id?: string;
    tableNumber: string;
    name: string | null;
  };
}

interface ServiceRequestManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  initialRequests: ServiceRequestItem[];
  initialStats: {
    pending: number;
    inProgress: number;
    completedToday: number;
  };
}

function getTypeDetails(type: ServiceRequestItem["type"]) {
  switch (type) {
    case "CALL_WAITER":
      return {
        label: "Call Waiter",
        icon: Bell,
        badgeBg: "bg-amber-500/15 text-amber-300 border-amber-500/30",
        iconColor: "text-amber-400",
      };
    case "WATER":
      return {
        label: "Water Refill",
        icon: Droplet,
        badgeBg: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
        iconColor: "text-cyan-400",
      };
    case "CUTLERY":
      return {
        label: "Plates & Cutlery",
        icon: UtensilsCrossed,
        badgeBg: "bg-purple-500/15 text-purple-300 border-purple-500/30",
        iconColor: "text-purple-400",
      };
    case "CLEANING":
      return {
        label: "Table Cleaning",
        icon: Sparkles,
        badgeBg: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
        iconColor: "text-emerald-400",
      };
    case "OTHER":
    default:
      return {
        label: "Other Request",
        icon: MessageSquare,
        badgeBg: "bg-slate-800 text-slate-300 border-slate-700",
        iconColor: "text-slate-400",
      };
  }
}

function getStatusBadge(status: ServiceRequestItem["status"]) {
  switch (status) {
    case "PENDING":
      return {
        label: "Pending",
        class: "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse",
      };
    case "IN_PROGRESS":
      return {
        label: "In Progress",
        class: "bg-sky-500/15 text-sky-400 border-sky-500/30",
      };
    case "COMPLETED":
      return {
        label: "Completed",
        class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      };
    case "CANCELLED":
      return {
        label: "Cancelled",
        class: "bg-slate-800 text-slate-400 border-slate-700",
      };
  }
}

function formatRelativeTime(dateInput: string | Date): string {
  const date = new Date(dateInput);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function RestaurantServiceRequestManager({
  restaurant,
  initialRequests,
  initialStats,
}: ServiceRequestManagerProps) {
  const [requests, setRequests] = useState<ServiceRequestItem[]>(initialRequests);
  const [stats, setStats] = useState(initialStats);
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const { refreshNow, dismissToast } = useRestaurantNotifications();

  const fetchRequests = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/service-requests`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data.requests);
        setStats(data.data.stats);
      }
    } catch (e) {
      console.error("Failed to refresh service requests:", e);
    } finally {
      setIsRefreshing(false);
    }
  }, [restaurant.id]);

  // Periodic polling for real-time dashboard updates
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) {
        return; // Pause when tab is not visible
      }
      fetchRequests();
    }, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchRequests]);

  async function handleStatusUpdate(
    requestId: string,
    newStatus: "PENDING" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
  ) {
    setUpdatingId(requestId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(
        `/api/restaurants/${restaurant.id}/service-requests/${requestId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        }
      );

      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update service request status.");
        return;
      }

      // Dismiss any open toast for this request
      dismissToast(requestId);

      setSuccess(`Request status updated to ${newStatus.replace("_", " ")}.`);
      await fetchRequests();
      // Sync global pending badge count across navbar
      await refreshNow();
    } catch {
      setError("Network error while updating request.");
    } finally {
      setUpdatingId(null);
    }
  }

  // Filtered list
  const filteredRequests = useMemo(() => {
    return requests.filter((req) => {
      // Status filter
      if (statusFilter !== "ALL" && req.status !== statusFilter) return false;
      // Type filter
      if (typeFilter !== "ALL" && req.type !== typeFilter) return false;
      // Search
      if (search.trim()) {
        const query = search.toLowerCase().trim();
        const matchesTable = req.table.tableNumber.toLowerCase().includes(query);
        const matchesName = req.table.name?.toLowerCase().includes(query) || false;
        const matchesMsg = req.message?.toLowerCase().includes(query) || false;
        if (!matchesTable && !matchesName && !matchesMsg) return false;
      }
      return true;
    });
  }, [requests, statusFilter, typeFilter, search]);

  return (
    <div className="space-y-6">
      {/* Top Header & Breadcrumb */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
            <Link href="/dashboard" className="hover:text-white transition">
              Restaurants
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link
              href={`/restaurants/${restaurant.id}/tables`}
              className="hover:text-white transition"
            >
              {restaurant.name}
            </Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-amber-400 font-semibold">Service Requests</span>
          </div>
          <h1 className="text-2xl font-black text-white flex items-center gap-2.5">
            <Bell className="w-6 h-6 text-amber-400" />
            <span>Table Service &amp; Waiter Calls</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Live dining room service requests from scanned customer table QR codes.
          </p>
        </div>

        {/* Header Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition flex items-center gap-1.5 cursor-pointer ${
              autoRefresh
                ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                : "bg-slate-900 text-slate-400 border-slate-800"
            }`}
            title={autoRefresh ? "Auto-refresh active (every 10s)" : "Auto-refresh paused"}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                autoRefresh ? "bg-emerald-400 animate-ping" : "bg-slate-500"
              }`}
            />
            <span>{autoRefresh ? "Live Sync On" : "Live Sync Paused"}</span>
          </button>

          <button
            type="button"
            disabled={isRefreshing}
            onClick={fetchRequests}
            className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-800 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-amber-400 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div
          onClick={() => setStatusFilter("PENDING")}
          className={`glass-card p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "PENDING"
              ? "border-amber-400 ring-1 ring-amber-400/50 bg-amber-500/5"
              : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">Pending Calls</span>
            <div className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
              <Bell className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-400">{stats.pending}</span>
            {stats.pending > 0 && (
              <span className="text-[10px] font-bold text-amber-400 animate-pulse">Needs Action</span>
            )}
          </div>
        </div>

        <div
          onClick={() => setStatusFilter("IN_PROGRESS")}
          className={`glass-card p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "IN_PROGRESS"
              ? "border-sky-400 ring-1 ring-sky-400/50 bg-sky-500/5"
              : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">In Progress</span>
            <div className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center">
              <Clock className="w-3.5 h-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-sky-400">{stats.inProgress}</span>
        </div>

        <div
          onClick={() => setStatusFilter("COMPLETED")}
          className={`glass-card p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "COMPLETED"
              ? "border-emerald-400 ring-1 ring-emerald-400/50 bg-emerald-500/5"
              : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">Completed Today</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-3.5 h-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-emerald-400">{stats.completedToday}</span>
        </div>

        <div
          onClick={() => setStatusFilter("ALL")}
          className={`glass-card p-4 rounded-2xl border transition cursor-pointer ${
            statusFilter === "ALL"
              ? "border-amber-400/80 ring-1 ring-amber-400/30"
              : "border-slate-800 hover:border-slate-700"
          }`}
        >
          <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
            <span className="font-semibold">Total Displayed</span>
            <div className="w-6 h-6 rounded-lg bg-slate-800 text-slate-400 flex items-center justify-center">
              <Filter className="w-3.5 h-3.5" />
            </div>
          </div>
          <span className="text-2xl font-black text-white">{requests.length}</span>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {success && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center justify-between">
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="text-emerald-400 hover:text-white font-bold ml-2">
            ✕
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        {/* Status Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
          {(["ALL", "PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const).map((s) => {
            const isActive = statusFilter === s;
            const count =
              s === "PENDING"
                ? stats.pending
                : s === "IN_PROGRESS"
                ? stats.inProgress
                : s === "COMPLETED"
                ? requests.filter((r) => r.status === "COMPLETED").length
                : s === "CANCELLED"
                ? requests.filter((r) => r.status === "CANCELLED").length
                : requests.length;

            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? "bg-amber-400 text-slate-950 shadow-md font-bold"
                    : "bg-slate-900 text-slate-400 hover:text-slate-200 border border-slate-800"
                }`}
              >
                <span>{s === "ALL" ? "All Requests" : s.replace("_", " ")}</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    isActive ? "bg-slate-950/20 text-slate-950 font-black" : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search & Type filter */}
        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
          >
            <option value="ALL">All Service Types</option>
            <option value="CALL_WAITER">Call Waiter</option>
            <option value="WATER">Water Refill</option>
            <option value="CUTLERY">Cutlery & Plates</option>
            <option value="CLEANING">Table Cleaning</option>
            <option value="OTHER">Other Requests</option>
          </select>

          <div className="relative flex-1 sm:w-48">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table/note..."
              className="w-full pl-8 pr-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>
        </div>
      </div>

      {/* Service Request Cards List */}
      {filteredRequests.length === 0 ? (
        <div className="glass-card rounded-3xl p-12 text-center border border-dashed border-slate-800 space-y-3">
          <div className="w-12 h-12 rounded-2xl bg-slate-900 text-slate-500 flex items-center justify-center mx-auto border border-slate-800">
            <Bell className="w-6 h-6" />
          </div>
          <h3 className="text-base font-bold text-white">No Service Requests Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto leading-relaxed">
            {requests.length === 0
              ? "When guests scan their table QR codes and request assistance or water, they will appear here in real-time."
              : "No requests match the selected status or search filter."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredRequests.map((req) => {
            const isUpdating = updatingId === req.id;
            const typeInfo = getTypeDetails(req.type);
            const statusBadge = getStatusBadge(req.status);
            const TypeIcon = typeInfo.icon;

            return (
              <div
                key={req.id}
                className={`glass-card rounded-2xl p-4 border transition flex flex-col justify-between space-y-3 ${
                  req.status === "PENDING"
                    ? "border-amber-500/40 bg-gradient-to-b from-amber-500/5 to-transparent"
                    : req.status === "IN_PROGRESS"
                    ? "border-sky-500/30"
                    : "border-slate-800/80 opacity-90"
                }`}
              >
                <div>
                  {/* Top Bar: Table Badge & Status Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 font-bold text-xs flex-shrink-0">
                        <QrCode className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-extrabold text-white tracking-tight">
                          Table {req.table.tableNumber}
                        </h4>
                        {req.table.name ? (
                          <p className="text-[10px] text-slate-400 truncate max-w-[130px]">
                            {req.table.name}
                          </p>
                        ) : (
                          <p className="text-[10px] text-slate-500 italic">Dine-in Table</p>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${statusBadge.class}`}
                      >
                        {statusBadge.label}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {formatRelativeTime(req.createdAt)}
                      </span>
                    </div>
                  </div>

                  {/* Request Type Banner */}
                  <div className="mt-3 flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 border ${typeInfo.badgeBg}`}
                    >
                      <TypeIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-200 block truncate">
                        {typeInfo.label}
                      </span>
                      {req.message ? (
                        <p className="text-[11px] text-amber-300 italic line-clamp-2 mt-0.5">
                          &ldquo;{req.message}&rdquo;
                        </p>
                      ) : (
                        <p className="text-[10px] text-slate-500">No additional note</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Staff Actions Bar */}
                <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-2">
                  {req.status === "PENDING" ? (
                    <>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "IN_PROGRESS")}
                        className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Clock className="w-3 h-3" />
                        <span>Accept</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "COMPLETED")}
                        className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Check className="w-3 h-3" />
                        <span>Done</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "CANCELLED")}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20 cursor-pointer"
                        title="Dismiss Request"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  ) : req.status === "IN_PROGRESS" ? (
                    <>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "COMPLETED")}
                        className="flex-1 py-1.5 px-2.5 rounded-xl text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50 shadow-sm"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Mark as Completed</span>
                      </button>

                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "CANCELLED")}
                        className="p-1.5 rounded-xl text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20 cursor-pointer"
                        title="Cancel Request"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <div className="w-full flex items-center justify-between text-[11px] text-slate-500">
                      <span>Status: {req.status}</span>
                      <button
                        type="button"
                        disabled={isUpdating}
                        onClick={() => handleStatusUpdate(req.id, "PENDING")}
                        className="text-[10px] text-amber-400 hover:underline cursor-pointer"
                      >
                        Re-open
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
