"use client";

import React, { useState } from "react";
import {
  Bell,
  Droplet,
  UtensilsCrossed,
  Sparkles,
  MessageSquare,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  QrCode,
} from "lucide-react";

export type ServiceOptionType = "CALL_WAITER" | "WATER" | "CUTLERY" | "CLEANING" | "OTHER";

interface ServiceOption {
  type: ServiceOptionType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accentColor: string;
}

const SERVICE_OPTIONS: ServiceOption[] = [
  {
    type: "CALL_WAITER",
    label: "Call Waiter",
    description: "Request assistance or server at your table",
    icon: Bell,
    accentColor: "from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-300",
  },
  {
    type: "WATER",
    label: "Water Refill",
    description: "Drinking water glasses or fresh bottle",
    icon: Droplet,
    accentColor: "from-cyan-500/20 to-blue-500/20 border-cyan-500/40 text-cyan-300",
  },
  {
    type: "CUTLERY",
    label: "Plates & Cutlery",
    description: "Extra plates, spoons, forks, or napkins",
    icon: UtensilsCrossed,
    accentColor: "from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-300",
  },
  {
    type: "CLEANING",
    label: "Table Cleaning",
    description: "Spill wipe down or clearing empty plates",
    icon: Sparkles,
    accentColor: "from-emerald-500/20 to-teal-500/20 border-emerald-500/40 text-emerald-300",
  },
  {
    type: "OTHER",
    label: "Other Request",
    description: "Custom inquiry or general table question",
    icon: MessageSquare,
    accentColor: "from-slate-700/40 to-slate-800/40 border-slate-600 text-slate-300",
  },
];

interface CustomerServiceRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  restaurantSlug: string;
  restaurantName: string;
  tableNumber: string;
  tableName?: string | null;
  qrToken: string;
}

export function CustomerServiceRequestModal({
  isOpen,
  onClose,
  restaurantSlug,
  restaurantName,
  tableNumber,
  tableName,
  qrToken,
}: CustomerServiceRequestModalProps) {
  const [selectedType, setSelectedType] = useState<ServiceOptionType>("CALL_WAITER");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;

    setError(null);
    setSuccessMessage(null);
    setLoading(true);

    try {
      const res = await fetch(`/api/r/${restaurantSlug}/service-requests`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          qrToken,
          type: selectedType,
          message: message.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to submit service request. Please try again.");
        return;
      }

      setSuccessMessage(data.message || "Your request has been received by our staff!");
      setMessage("");
    } catch {
      setError("Network error while submitting request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleResetAndClose() {
    setError(null);
    setSuccessMessage(null);
    setMessage("");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg glass-card rounded-3xl border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/80 bg-slate-900/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-bold">
              <Bell className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h3 className="text-base font-black text-white">Call Waiter &amp; Service</h3>
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <span>{restaurantName}</span>
                <span>•</span>
                <span className="font-semibold text-amber-400 flex items-center gap-1">
                  <QrCode className="w-3 h-3" />
                  {tableName ? `Table ${tableNumber} (${tableName})` : `Table ${tableNumber}`}
                </span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleResetAndClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {successMessage ? (
            <div className="py-8 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center justify-center mx-auto animate-bounce">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h4 className="text-lg font-black text-white">Request Dispatched!</h4>
              <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                {successMessage}
              </p>
              <div className="pt-4 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setSuccessMessage(null)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 bg-slate-800 hover:bg-slate-700 transition cursor-pointer"
                >
                  Make Another Request
                </button>
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-5 py-2 rounded-xl text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-300 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Select Assistance Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SERVICE_OPTIONS.map((opt) => {
                    const isSelected = selectedType === opt.type;
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setSelectedType(opt.type)}
                        className={`p-3 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                          isSelected
                            ? `bg-gradient-to-br ${opt.accentColor} shadow-lg ring-1 ring-amber-400/50`
                            : "bg-slate-900/60 border-slate-800 hover:border-slate-700 text-slate-300"
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isSelected ? "bg-amber-400 text-slate-950 font-bold" : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{opt.label}</p>
                          <p className="text-[10px] text-slate-400 leading-tight mt-0.5">
                            {opt.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                  Optional Short Note <span className="text-slate-500 text-[10px] font-normal">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={200}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    selectedType === "WATER"
                      ? "e.g., Warm water, extra ice..."
                      : selectedType === "CUTLERY"
                      ? "e.g., 2 extra spoons, napkins..."
                      : selectedType === "CLEANING"
                      ? "e.g., Water spill on table..."
                      : "e.g., Need bill / have question..."
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl text-xs bg-slate-900 border border-slate-800 text-white placeholder-slate-500 focus:outline-none focus:border-amber-400 transition"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 hover:from-amber-300 hover:to-orange-400 transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-amber-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Sending Request...</span>
                    </>
                  ) : (
                    <>
                      <Bell className="w-3.5 h-3.5 fill-current" />
                      <span>Notify Staff</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
