"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Bell,
  Droplet,
  UtensilsCrossed,
  Sparkles,
  MessageSquare,
  X,
  Check,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { useRestaurantNotifications, ServiceRequestToast } from "@/context/RestaurantNotificationContext";

function getToastIcon(type: ServiceRequestToast["type"]) {
  switch (type) {
    case "CALL_WAITER":
      return <Bell className="w-4 h-4 text-amber-400 stroke-[2.5]" />;
    case "WATER":
      return <Droplet className="w-4 h-4 text-cyan-400 stroke-[2.5]" />;
    case "CUTLERY":
      return <UtensilsCrossed className="w-4 h-4 text-purple-400 stroke-[2.5]" />;
    case "CLEANING":
      return <Sparkles className="w-4 h-4 text-emerald-400 stroke-[2.5]" />;
    case "OTHER":
    default:
      return <MessageSquare className="w-4 h-4 text-slate-300 stroke-[2.5]" />;
  }
}

function getToastLabel(type: ServiceRequestToast["type"]) {
  switch (type) {
    case "CALL_WAITER":
      return "Call Waiter";
    case "WATER":
      return "Water Refill";
    case "CUTLERY":
      return "Extra Cutlery";
    case "CLEANING":
      return "Table Cleaning";
    case "OTHER":
    default:
      return "Service Assistance";
  }
}

export function NotificationToasts() {
  const {
    restaurantId,
    toasts,
    dismissToast,
    dismissAllToasts,
    quickAcceptRequest,
  } = useRestaurantNotifications();

  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  if (!restaurantId || restaurantId === "new") return null;

  async function handleAccept(id: string) {
    setAcceptingId(id);
    await quickAcceptRequest(id);
    setAcceptingId(null);
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2.5 max-w-sm w-full pointer-events-none px-3 sm:px-0">
      {/* Floating Service Request Alert Toasts */}
      {toasts.map((toast) => {
        const isAccepting = acceptingId === toast.id;

        return (
          <div
            key={toast.id}
            role="alert"
            className={`pointer-events-auto w-full glass-card p-4 rounded-2xl border shadow-2xl backdrop-blur-xl flex flex-col gap-2.5 transition animate-in fade-in slide-in-from-bottom-3 duration-200 ${
              toast.isReminder
                ? "border-amber-400/80 bg-gradient-to-b from-amber-500/15 via-slate-900/95 to-slate-950/95 ring-1 ring-amber-400/40"
                : "border-slate-700/80 bg-slate-950/95 ring-1 ring-slate-800"
            }`}
          >
            {/* Header: Table and Dismiss Button */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center flex-shrink-0 shadow-sm">
                  {getToastIcon(toast.type)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black text-white">
                      Table {toast.tableNumber}
                    </span>
                    {toast.tableName && (
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">
                        ({toast.tableName})
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="text-[11px] font-bold text-amber-400">
                      {getToastLabel(toast.type)}
                    </span>
                    {toast.isReminder && (
                      <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        Reminder
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => dismissToast(toast.id)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800/60 transition cursor-pointer"
                title="Dismiss alert"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Optional Customer Note */}
            {toast.message && (
              <p className="text-xs text-slate-300 italic pl-10 pr-2 line-clamp-2">
                &ldquo;{toast.message}&rdquo;
              </p>
            )}

            {/* Quick Actions Footer */}
            <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-800/60">
              <Link
                href={`/restaurants/${restaurantId}/service-requests`}
                onClick={() => dismissToast(toast.id)}
                className="px-2.5 py-1 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-slate-800/80 transition flex items-center gap-1"
              >
                <span>View All</span>
                <ChevronRight className="w-3 h-3" />
              </Link>

              <button
                type="button"
                disabled={isAccepting}
                onClick={() => handleAccept(toast.id)}
                className="px-3.5 py-1 rounded-lg text-[11px] font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 transition flex items-center gap-1 cursor-pointer disabled:opacity-50 shadow-sm"
              >
                {isAccepting ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Check className="w-3 h-3 stroke-[2.5]" />
                )}
                <span>Accept</span>
              </button>
            </div>
          </div>
        );
      })}

      {/* Dismiss All button if multiple toasts */}
      {toasts.length > 2 && (
        <button
          type="button"
          onClick={dismissAllToasts}
          className="pointer-events-auto px-3 py-1 rounded-full text-[10px] font-bold bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white border border-slate-800 shadow-md transition cursor-pointer"
        >
          Dismiss All ({toasts.length})
        </button>
      )}
    </div>
  );
}
