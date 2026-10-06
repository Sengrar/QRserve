"use client";

import React, { useState, ComponentProps } from "react";
import { Store, CreditCard } from "lucide-react";
import { AdminApprovalTable } from "@/components/admin/AdminApprovalTable";
import { AdminSubscriptionManager } from "@/components/admin/AdminSubscriptionManager";

interface AdminDashboardTabsProps {
  restaurants: ComponentProps<typeof AdminApprovalTable>["initialRestaurants"];
  subscriptions: ComponentProps<typeof AdminSubscriptionManager>["initialSubscriptions"];
  paymentRequests: ComponentProps<typeof AdminSubscriptionManager>["initialPaymentRequests"];
  paymentConfig: ComponentProps<typeof AdminSubscriptionManager>["initialPaymentConfig"];
  pendingApprovalsCount: number;
  pendingPaymentsCount: number;
}

export function AdminDashboardTabs({
  restaurants,
  subscriptions,
  paymentRequests,
  paymentConfig,
  pendingApprovalsCount,
  pendingPaymentsCount,
}: AdminDashboardTabsProps) {
  const [activeMainTab, setActiveMainTab] = useState<"restaurants" | "subscriptions">("restaurants");

  return (
    <div className="space-y-6">
      {/* Top High-Level Switcher */}
      <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
        <button
          type="button"
          onClick={() => setActiveMainTab("restaurants")}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2 cursor-pointer ${
            activeMainTab === "restaurants"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/20"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
          }`}
        >
          <Store className="w-4 h-4" />
          <span>Restaurant Approvals</span>
          {pendingApprovalsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-950 text-amber-400 font-extrabold ml-1">
              {pendingApprovalsCount}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveMainTab("subscriptions")}
          className={`px-5 py-2.5 rounded-xl font-bold text-sm transition flex items-center gap-2 cursor-pointer ${
            activeMainTab === "subscriptions"
              ? "bg-gradient-to-r from-amber-400 to-orange-500 text-slate-950 shadow-lg shadow-amber-500/20"
              : "bg-slate-900 text-slate-300 hover:bg-slate-800 border border-slate-800"
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Subscriptions & Payments</span>
          {pendingPaymentsCount > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs bg-slate-950 text-amber-400 font-extrabold ml-1">
              {pendingPaymentsCount}
            </span>
          )}
        </button>
      </div>

      {/* Tab Panels */}
      {activeMainTab === "restaurants" ? (
        <AdminApprovalTable initialRestaurants={restaurants} />
      ) : (
        <AdminSubscriptionManager
          initialSubscriptions={subscriptions}
          initialPaymentRequests={paymentRequests}
          initialPaymentConfig={paymentConfig}
        />
      )}
    </div>
  );
}
