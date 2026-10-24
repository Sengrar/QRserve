/* eslint-disable @next/next/no-img-element */
"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import QRCode from "qrcode";
import {
  Table as TableIcon,
  Plus,
  QrCode,
  CheckCircle2,
  AlertTriangle,
  ArrowLeft,
  Trash2,
  Power,
  CreditCard,
  Edit2,
  Printer,
  Download,
  RefreshCw,
  Copy,
  Check,
  X,
  Search,
} from "lucide-react";

export interface TableItem {
  id: string;
  tableNumber: string;
  name: string | null;
  status: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "INACTIVE";
  qrToken: string | null;
  qrCodeUrl: string | null;
  isActive: boolean;
  createdAt: string | Date;
}

interface TableManagerProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
  };
  initialTables: TableItem[];
  initialUsage: {
    subscription: {
      hasSubscription: boolean;
      isValid: boolean;
      isExpired: boolean;
      isSuspended: boolean;
      isNearExpiry: boolean;
      daysRemaining: number;
      tableLimit: number;
      plan: string | null;
      status: string | null;
    };
    totalTables: number;
    activeTables: number;
    remainingAllowance: number;
    isAtLimit: boolean;
  };
}

export function RestaurantTableManager({
  restaurant,
  initialTables,
  initialUsage,
}: TableManagerProps) {
  const [tables, setTables] = useState<TableItem[]>(initialTables);
  const [usage, setUsage] = useState(initialUsage);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  // Notifications
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Table Create / Edit Modal
  const [tableModalOpen, setTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<TableItem | null>(null);
  const [formTableNumber, setFormTableNumber] = useState("");
  const [formTableName, setFormTableName] = useState("");
  const [formTableStatus, setFormTableStatus] = useState<"AVAILABLE" | "OCCUPIED" | "RESERVED" | "INACTIVE">("AVAILABLE");
  const [formTableActive, setFormTableActive] = useState(true);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // QR Modal
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedQrTable, setSelectedQrTable] = useState<TableItem | null>(null);
  const [qrData, setQrData] = useState<{
    dataUrl: string;
    svg: string;
    fullCustomerUrl: string;
  } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrRegenerating, setQrRegenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrThumbnails, setQrThumbnails] = useState<Record<string, string>>({});

  // Generate QR thumbnail previews for all tables
  useEffect(() => {
    let isMounted = true;
    tables.forEach(async (table) => {
      if (!table.qrToken) return;
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const fullUrl = `${origin}/r/${restaurant.slug}?qr=${encodeURIComponent(table.qrToken)}`;
      try {
        const dataUrl = await QRCode.toDataURL(fullUrl, {
          width: 160,
          margin: 1,
          color: { dark: "#0f172a", light: "#ffffff" },
        });
        if (isMounted) {
          setQrThumbnails((prev) => ({ ...prev, [table.id]: dataUrl }));
        }
      } catch (err) {
        console.error("Failed to generate table QR preview:", err);
      }
    });
    return () => {
      isMounted = false;
    };
  }, [tables, restaurant.slug]);

  // Background scroll lock
  React.useEffect(() => {
    if (tableModalOpen || qrModalOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [tableModalOpen, qrModalOpen]);

  async function handleRefresh() {
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables`);
      const result = await res.json();
      if (result.success) {
        setTables(result.data.tables);
        setUsage(result.data.usage);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function openAddModal() {
    if (usage.isAtLimit) {
      setError(
        `This restaurant has reached its allowed table limit (${usage.activeTables} / ${usage.subscription.tableLimit} tables used). You cannot create additional tables until the allowed limit is increased by the administrator or unused tables are deactivated.`
      );
      return;
    }
    setEditingTable(null);
    setFormTableNumber("");
    setFormTableName("");
    setFormTableStatus("AVAILABLE");
    setFormTableActive(true);
    setError(null);
    setSuccess(null);
    setTableModalOpen(true);
  }

  function openEditModal(table: TableItem) {
    setEditingTable(table);
    setFormTableNumber(table.tableNumber);
    setFormTableName(table.name || "");
    setFormTableStatus(table.status || "AVAILABLE");
    setFormTableActive(table.isActive);
    setError(null);
    setSuccess(null);
    setTableModalOpen(true);
  }

  async function handleTableFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formTableNumber.trim()) {
      setError("Table number is required.");
      return;
    }

    setFormSubmitting(true);
    setError(null);
    setSuccess(null);

    const isEditing = !!editingTable;
    const url = isEditing
      ? `/api/restaurants/${restaurant.id}/tables/${editingTable.id}`
      : `/api/restaurants/${restaurant.id}/tables`;
    const method = isEditing ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tableNumber: formTableNumber.trim(),
          name: formTableName.trim() || null,
          status: formTableStatus,
          isActive: formTableActive,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to save table.");
        return;
      }

      setTableModalOpen(false);
      setSuccess(isEditing ? `Table "${formTableNumber.trim()}" updated successfully.` : `Table "${formTableNumber.trim()}" created successfully.`);
      await handleRefresh();
    } catch {
      setError("Network error while saving table.");
    } finally {
      setFormSubmitting(false);
    }
  }

  async function handleToggleTable(table: TableItem) {
    setActionLoadingId(table.id);
    setError(null);
    setSuccess(null);

    const nextActive = !table.isActive;
    const nextStatus = nextActive ? "AVAILABLE" : "INACTIVE";

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables/${table.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextActive, status: nextStatus }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update table.");
        return;
      }

      await handleRefresh();
    } catch {
      setError("Network error while updating table.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleQuickStatusChange(table: TableItem, nextStatus: "AVAILABLE" | "OCCUPIED" | "RESERVED" | "INACTIVE") {
    setActionLoadingId(table.id);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables/${table.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: nextStatus }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update table status.");
        return;
      }

      await handleRefresh();
    } catch {
      setError("Network error while updating table status.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDeleteTable(tableId: string, tableNumber: string) {
    if (!confirm(`Are you sure you want to delete Table "${tableNumber}"? This action cannot be undone.`)) {
      return;
    }

    setActionLoadingId(tableId);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables/${tableId}`, {
        method: "DELETE",
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to delete table.");
        return;
      }

      setSuccess(`Table "${tableNumber}" deleted successfully.`);
      await handleRefresh();
    } catch {
      setError("Network error while deleting table.");
    } finally {
      setActionLoadingId(null);
    }
  }

  async function openQrModal(table: TableItem) {
    setSelectedQrTable(table);
    const existingThumbnail = qrThumbnails[table.id];
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const customerFullUrl = table.qrToken ? `${origin}/r/${restaurant.slug}?qr=${encodeURIComponent(table.qrToken)}` : "";

    setQrData(existingThumbnail ? {
      dataUrl: existingThumbnail,
      svg: "",
      fullCustomerUrl: customerFullUrl,
    } : null);
    setQrLoading(!existingThumbnail);
    setCopied(false);
    setQrModalOpen(true);

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables/${table.id}/qr`);
      const data = await res.json();
      if (data.success) {
        setQrData({
          dataUrl: data.data.dataUrl,
          svg: data.data.svg,
          fullCustomerUrl: data.data.fullCustomerUrl,
        });
      } else {
        setError(data.error || "Failed to load QR details.");
      }
    } catch {
      setError("Network error while loading QR code.");
    } finally {
      setQrLoading(false);
    }
  }

  async function handleRegenerateQr() {
    if (!selectedQrTable) return;

    if (
      !confirm(
        `Are you sure you want to regenerate the QR code for Table "${selectedQrTable.tableNumber}"?\n\nWARNING: Any previously printed QR stands or stickers for this table will immediately stop working!`
      )
    ) {
      return;
    }

    setQrRegenerating(true);
    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}/tables/${selectedQrTable.id}/regenerate`, {
        method: "POST",
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to regenerate QR.");
        return;
      }

      setSuccess(`QR code for Table "${selectedQrTable.tableNumber}" regenerated successfully.`);
      await handleRefresh();
      // Reload current QR modal view
      await openQrModal(data.data.table);
    } catch {
      setError("Network error while regenerating QR.");
    } finally {
      setQrRegenerating(false);
    }
  }

  function handleCopyCustomerUrl() {
    if (!qrData?.fullCustomerUrl) return;
    navigator.clipboard.writeText(qrData.fullCustomerUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handlePrintTentCard() {
    if (!selectedQrTable || !qrData) return;

    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print table tent cards.");
      return;
    }

    const title = `${restaurant.name} - Table ${selectedQrTable.tableNumber}`;
    const tableLabel = selectedQrTable.name ? `${selectedQrTable.tableNumber} • ${selectedQrTable.name}` : `Table ${selectedQrTable.tableNumber}`;

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>${title}</title>
          <style>
            @page { size: auto; margin: 15mm; }
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #0f172a;
              margin: 0;
              padding: 20px;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 90vh;
              background: #ffffff;
            }
            .card {
              width: 320px;
              border: 2px dashed #94a3b8;
              border-radius: 24px;
              padding: 32px 24px;
              text-align: center;
              box-sizing: border-box;
            }
            .restaurant {
              font-size: 20px;
              font-weight: 800;
              color: #0f172a;
              margin: 0 0 6px;
              letter-spacing: -0.5px;
            }
            .table-badge {
              display: inline-block;
              background: #f1f5f9;
              color: #0f172a;
              font-size: 13px;
              font-weight: 700;
              padding: 4px 14px;
              border-radius: 9999px;
              margin-bottom: 20px;
              border: 1px solid #e2e8f0;
            }
            .qr-wrap {
              width: 220px;
              height: 220px;
              margin: 0 auto 16px;
              background: #ffffff;
              padding: 8px;
              border-radius: 16px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
            }
            .qr-wrap img {
              width: 100%;
              height: 100%;
              display: block;
            }
            .instruction {
              font-size: 14px;
              font-weight: 700;
              color: #0f172a;
              margin: 0 0 4px;
            }
            .subtext {
              font-size: 11px;
              color: #64748b;
              margin: 0;
            }
            .footer {
              margin-top: 24px;
              font-size: 10px;
              color: #94a3b8;
              text-transform: uppercase;
              letter-spacing: 1px;
              font-weight: 600;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h1 class="restaurant">${restaurant.name}</h1>
            <div class="table-badge">${tableLabel}</div>
            <div class="qr-wrap">
              <img src="${qrData.dataUrl}" alt="Table QR" />
            </div>
            <p class="instruction">Scan with phone camera</p>
            <p class="subtext">View our live digital menu &amp; daily specials</p>
            <p class="footer">Powered by QRServe</p>
          </div>
          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  }

  const sub = usage.subscription;

  // Filter tables
  const filteredTables = tables.filter((t) => {
    const matchesSearch =
      !search.trim() ||
      t.tableNumber.toLowerCase().includes(search.toLowerCase()) ||
      (t.name && t.name.toLowerCase().includes(search.toLowerCase()));

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "ACTIVE" && t.isActive) ||
      (statusFilter === "INACTIVE" && !t.isActive) ||
      t.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8">
      {/* Top Header */}
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
            <span>Table &amp; QR Management</span>
            <span className="text-sm font-medium px-3 py-1 rounded-full bg-slate-800 text-amber-400 border border-slate-700">
              {restaurant.name}
            </span>
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Generate secure table QR codes, organize dining floor status, and monitor table limits.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href={`/restaurants/${restaurant.id}/subscription`}
            className="px-4 py-2.5 rounded-xl text-xs font-semibold text-amber-300 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition flex items-center gap-2"
          >
            <CreditCard className="w-4 h-4 text-amber-400" />
            Subscription &amp; Limits
          </Link>
        </div>
      </div>

      {/* Subscription Allowance Banner */}
      <div className="glass-card rounded-2xl p-6 border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Active Subscribed Floor Plan
            </span>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              <span>{sub.hasSubscription ? `${sub.plan} Plan` : "No Active Subscription"}</span>
              {sub.isValid ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase">
                  Active
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase">
                  {sub.status || "Unsubscribed"}
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Allowed Tables: <strong className="text-white">{sub.tableLimit}</strong> &bull; Active In-Use:{" "}
              <strong className="text-amber-400">{usage.activeTables}</strong> &bull; Total Created:{" "}
              <strong className="text-slate-300">{usage.totalTables}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {usage.isAtLimit ? (
              <div className="px-3.5 py-2 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>Table Limit Reached ({usage.activeTables}/{sub.tableLimit})</span>
              </div>
            ) : (
              <div className="px-3.5 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{usage.remainingAllowance} tables remaining</span>
              </div>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-4 w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
          <div
            className={`h-full transition-all ${
              usage.isAtLimit ? "bg-amber-400" : "bg-gradient-to-r from-emerald-500 to-cyan-500"
            }`}
            style={{
              width: `${Math.min(100, sub.tableLimit > 0 ? (usage.activeTables / sub.tableLimit) * 100 : 0)}%`,
            }}
          />
        </div>
      </div>

      {/* Action / Notification Banners */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{success}</div>
          <button onClick={() => setSuccess(null)} className="text-slate-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Controls Bar: Search, Filters & Add Table Button */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search table number or name..."
              className="w-full pl-9 pr-4 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-xl text-xs bg-slate-900 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
            >
              <option value="all">All Statuses</option>
              <option value="AVAILABLE">Available</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="RESERVED">Reserved</option>
              <option value="INACTIVE">Inactive / Hidden</option>
            </select>

            <button
              type="button"
              onClick={handleRefresh}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition"
              title="Refresh"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={openAddModal}
          disabled={usage.isAtLimit || !sub.isValid}
          className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer shadow-md shadow-amber-500/20"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" />
          <span>Add Table</span>
        </button>
      </div>

      {/* Tables Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white">Configured Tables</h2>
          <span className="text-xs text-slate-400">
            Showing {filteredTables.length} of {tables.length} tables
          </span>
        </div>

        {filteredTables.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
              <TableIcon className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-white">
              {tables.length === 0 ? "No Tables Added Yet" : "No Tables Match Filter"}
            </h4>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {tables.length === 0
                ? "Add your restaurant's first dining table above to generate secure QR ordering codes."
                : "Try adjusting your search query or status filter."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTables.map((table) => {
              const isLoading = actionLoadingId === table.id;
              const customerQrUrl = `/r/${restaurant.slug}?qr=${encodeURIComponent(table.qrToken || "")}`;

              // Status badges
              const statusBadges: Record<string, { label: string; class: string }> = {
                AVAILABLE: { label: "Available", class: "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" },
                OCCUPIED: { label: "Occupied", class: "bg-amber-500/15 text-amber-400 border-amber-500/25" },
                RESERVED: { label: "Reserved", class: "bg-sky-500/15 text-sky-400 border-sky-500/25" },
                INACTIVE: { label: "Inactive", class: "bg-slate-800 text-slate-400 border-slate-700" },
              };

              const currentBadge = statusBadges[table.status] || statusBadges.AVAILABLE;

              return (
                <div
                  key={table.id}
                  className="glass-card rounded-2xl p-5 border border-slate-800 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition"
                >
                  <div>
                    {/* Top Row: Table Number + Badges */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center border border-amber-500/20 font-bold text-xs flex-shrink-0">
                          <TableIcon className="w-4 h-4" />
                        </div>
                        <div>
                          <h4 className="text-base font-bold text-white tracking-tight leading-tight">
                            {table.tableNumber}
                          </h4>
                          {table.name ? (
                            <p className="text-xs text-slate-400 font-medium truncate max-w-[150px]">{table.name}</p>
                          ) : (
                            <p className="text-[11px] text-slate-500 italic">No custom label</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase border ${currentBadge.class}`}>
                          {currentBadge.label}
                        </span>
                      </div>
                    </div>

                    {/* Quick Status Selector */}
                    {table.isActive && (
                      <div className="mt-3 flex items-center gap-1 bg-slate-950/80 p-1 rounded-xl border border-slate-900">
                        <span className="text-[10px] text-slate-500 px-2 font-medium">Status:</span>
                        {(["AVAILABLE", "OCCUPIED", "RESERVED"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            disabled={isLoading}
                            onClick={() => handleQuickStatusChange(table, s)}
                            className={`flex-1 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                              table.status === s
                                ? "bg-slate-800 text-white shadow-sm"
                                : "text-slate-400 hover:text-slate-200"
                            }`}
                          >
                            {s === "AVAILABLE" ? "Free" : s === "OCCUPIED" ? "Busy" : "Hold"}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Customer QR Preview Snippet */}
                    <div className="mt-3 p-3 rounded-xl bg-slate-950/80 border border-slate-900 flex items-center gap-3">
                      {/* Interactive QR Thumbnail */}
                      <button
                        type="button"
                        onClick={() => openQrModal(table)}
                        className="group relative flex-shrink-0 w-16 h-16 bg-white p-1 rounded-xl overflow-hidden shadow-md border border-slate-700 hover:scale-105 hover:ring-2 hover:ring-amber-400 transition cursor-pointer"
                        title="Click to view & print QR"
                      >
                        {qrThumbnails[table.id] ? (
                          <img
                            src={qrThumbnails[table.id]}
                            alt={`Table ${table.tableNumber} QR`}
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                            <QrCode className="w-6 h-6 animate-pulse text-amber-500" />
                          </div>
                        )}
                        <div className="absolute inset-0 bg-slate-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition text-[9px] font-bold text-white uppercase tracking-wider">
                          View
                        </div>
                      </button>

                      {/* Info & Quick Actions */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-semibold text-slate-300">Scan to Order</span>
                          <button
                            type="button"
                            onClick={() => openQrModal(table)}
                            className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                          >
                            <QrCode className="w-3.5 h-3.5" />
                            <span>Expand</span>
                          </button>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5" title={customerQrUrl}>
                          {customerQrUrl}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <button
                            type="button"
                            onClick={() => openQrModal(table)}
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-300 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer flex items-center gap-1"
                          >
                            <Printer className="w-2.5 h-2.5" />
                            <span>Stand</span>
                          </button>
                          <a
                            href={`/api/restaurants/${restaurant.id}/tables/${table.id}/qr?download=png`}
                            download
                            className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 transition flex items-center gap-1"
                            title="Download PNG QR"
                          >
                            <Download className="w-2.5 h-2.5" />
                            <span>PNG</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                    <button
                      type="button"
                      disabled={isLoading}
                      onClick={() => handleToggleTable(table)}
                      className={`text-xs px-2.5 py-1 rounded-lg border font-medium flex items-center gap-1.5 transition cursor-pointer ${
                        table.isActive
                          ? "bg-slate-800/60 text-slate-300 border-slate-700 hover:bg-slate-800"
                          : "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                      }`}
                    >
                      <Power className="w-3 h-3" />
                      <span>{table.isActive ? "Deactivate" : "Activate"}</span>
                    </button>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => openQrModal(table)}
                        className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition cursor-pointer"
                        title="QR Code & Tent Card"
                      >
                        <QrCode className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => openEditModal(table)}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                        title="Edit Table"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        disabled={isLoading}
                        onClick={() => handleDeleteTable(table.id, table.tableNumber)}
                        className="p-1.5 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 hover:bg-rose-500/20 transition cursor-pointer"
                        title="Delete Table"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Add / Edit Table Modal */}
      {tableModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden">
          <div className="w-full max-w-[480px] glass-card rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 flex-shrink-0 bg-slate-900/60">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <TableIcon className="w-4 h-4 text-amber-400" />
                <span>{editingTable ? "Edit Table" : "Add Dining Table"}</span>
              </h3>
              <button
                type="button"
                onClick={() => setTableModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleTableFormSubmit} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Table Number <span className="text-amber-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formTableNumber}
                    onChange={(e) => setFormTableNumber(e.target.value)}
                    placeholder="e.g., T-1, 102, Table 4"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Label / Name <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formTableName}
                    onChange={(e) => setFormTableName(e.target.value)}
                    placeholder="e.g., Patio Booth, VIP Lounge"
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Floor Status
                  </label>
                  <select
                    value={formTableStatus}
                    onChange={(e) => setFormTableStatus(e.target.value as "AVAILABLE" | "OCCUPIED" | "RESERVED" | "INACTIVE")}
                    className="w-full px-3.5 py-2 rounded-xl text-xs bg-slate-950 border border-slate-800 text-white focus:outline-none focus:border-amber-400"
                  >
                    <option value="AVAILABLE">Available (Free)</option>
                    <option value="OCCUPIED">Occupied (Busy)</option>
                    <option value="RESERVED">Reserved</option>
                    <option value="INACTIVE">Inactive</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">
                    Active Floor State
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const next = !formTableActive;
                      setFormTableActive(next);
                      if (!next) setFormTableStatus("INACTIVE");
                      else if (formTableStatus === "INACTIVE") setFormTableStatus("AVAILABLE");
                    }}
                    className={`w-full py-2 px-3 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                      formTableActive
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-slate-900 text-slate-400 border-slate-800"
                    }`}
                  >
                    {formTableActive ? "Active Table" : "Inactive (Hidden)"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setTableModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? "Saving..." : editingTable ? "Update Table" : "Create Table"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code & Printable Tent Card Modal */}
      {qrModalOpen && selectedQrTable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm overflow-hidden">
          <div className="w-full max-w-[520px] max-h-[90vh] glass-card rounded-2xl border border-slate-800 shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/80 flex-shrink-0 bg-slate-900/60">
              <div className="flex items-center gap-2">
                <QrCode className="w-4 h-4 text-amber-400" />
                <h3 className="text-base font-bold text-white">
                  Table {selectedQrTable.tableNumber} QR Code
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Scrollable Modal Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 text-center">
              {qrLoading ? (
                <div className="py-12 flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 text-amber-400 animate-spin" />
                  <p className="text-xs text-slate-400">Generating secure QR code...</p>
                </div>
              ) : qrData ? (
                <>
                  {/* Clean QR Presentation Card */}
                  <div className="bg-white p-5 rounded-2xl max-w-[260px] mx-auto shadow-xl text-slate-950">
                    <p className="text-xs font-black uppercase tracking-wider text-slate-800 mb-1">
                      {restaurant.name}
                    </p>
                    <p className="text-sm font-extrabold text-amber-600 mb-3">
                      {selectedQrTable.name
                        ? `${selectedQrTable.tableNumber} • ${selectedQrTable.name}`
                        : `Table ${selectedQrTable.tableNumber}`}
                    </p>
                    <div className="w-48 h-48 mx-auto bg-white">
                      <img
                        src={qrData.dataUrl}
                        alt={`QR Code for Table ${selectedQrTable.tableNumber}`}
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <p className="text-[10px] text-slate-500 font-semibold mt-3">
                      Scan with camera to view menu
                    </p>
                  </div>

                  {/* Customer Link Box */}
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-900 text-left space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span className="font-semibold">Scanned Destination URL:</span>
                      <button
                        type="button"
                        onClick={handleCopyCustomerUrl}
                        className="text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copied ? "Copied" : "Copy Link"}</span>
                      </button>
                    </div>
                    <p className="text-xs font-mono text-slate-300 break-all">{qrData.fullCustomerUrl}</p>
                  </div>

                  {/* Quick Export Actions */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={handlePrintTentCard}
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>Print Stand</span>
                    </button>

                    <a
                      href={`/api/restaurants/${restaurant.id}/tables/${selectedQrTable.id}/qr?download=png`}
                      download
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>PNG Image</span>
                    </a>

                    <a
                      href={`/api/restaurants/${restaurant.id}/tables/${selectedQrTable.id}/qr?download=svg`}
                      download
                      className="px-3 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>SVG Vector</span>
                    </a>
                  </div>

                  {/* Regeneration Warning Box */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-left">
                    <div>
                      <p className="text-xs font-semibold text-slate-300">Regenerate QR Token</p>
                      <p className="text-[11px] text-slate-500">
                        Invalidates previous physical prints in case of misuse.
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={qrRegenerating}
                      onClick={handleRegenerateQr}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 transition flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${qrRegenerating ? "animate-spin" : ""}`} />
                      <span>{qrRegenerating ? "Regenerating..." : "Regenerate"}</span>
                    </button>
                  </div>
                </>
              ) : null}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end px-5 py-3 border-t border-slate-800/80 flex-shrink-0 bg-slate-900/60">
              <button
                type="button"
                onClick={() => setQrModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
