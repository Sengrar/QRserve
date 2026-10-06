"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  QrCode,
  Store,
  Plus,
  LogOut,
  UserCircle,
  UtensilsCrossed,
  Table as TableIcon,
  CreditCard,
  BarChart3,
  ChefHat,
  Settings,
  Bell,
  Ticket,
} from "lucide-react";
import { SessionUser } from "@/types";
import { useRestaurantNotifications } from "@/context/RestaurantNotificationContext";
import dynamic from "next/dynamic";

const NotificationControlsPopover = dynamic(
  () =>
    import("@/components/notifications/NotificationControlsPopover").then(
      (mod) => mod.NotificationControlsPopover
    ),
  {
    ssr: false,
    loading: () => (
      <div className="w-8 h-8 rounded-lg opacity-0 pointer-events-none" aria-hidden="true" />
    ),
  }
);

interface RestaurantAdminNavProps {
  user: SessionUser;
}

export function RestaurantAdminNav({ user }: RestaurantAdminNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);
  const { pendingCount } = useRestaurantNotifications();

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error("Logout failed:", err);
      setLoggingOut(false);
    }
  }

  // Extract restaurantId from pathname if browsing /restaurants/[id]/*
  const restaurantMatch = pathname.match(/^\/restaurants\/([^/]+)/);
  const currentRestaurantId = restaurantMatch ? restaurantMatch[1] : null;
  const isCreatingNew = currentRestaurantId === "new";

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-3">
        {/* Brand & Navigation */}
        <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
          <Link href="/dashboard" className="flex items-center gap-2 group flex-shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform flex-shrink-0">
              <QrCode className="w-5 h-5 text-slate-950" />
            </div>
            <div className="hidden sm:block">
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 bg-clip-text text-transparent">
                  QRServe
                </span>
                <span className="px-1.5 py-0.2 rounded-full text-[9px] font-extrabold uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  Portal
                </span>
              </div>
            </div>
          </Link>

          {/* Navigation Items - Desktop */}
          <nav className="hidden md:flex items-center gap-1 min-w-0 overflow-x-auto no-scrollbar py-1">
            <Link
              href="/dashboard"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                pathname === "/dashboard"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span>My Restaurants</span>
            </Link>

            {currentRestaurantId && !isCreatingNew && (
              <>
                <span className="text-slate-700 flex-shrink-0">/</span>
                <Link
                  href={`/restaurants/${currentRestaurantId}/orders`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/orders")
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <ChefHat className="w-3.5 h-3.5 text-amber-400" />
                  <span>Kitchen & Orders</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/service-requests`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/service-requests")
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <div className="relative flex items-center">
                    <Bell className="w-3.5 h-3.5 text-amber-400" />
                    {pendingCount > 0 && (
                      <span className="absolute -top-2 -right-2 px-1 min-w-[15px] h-[15px] rounded-full text-[9px] font-black bg-rose-500 text-white flex items-center justify-center animate-pulse shadow-sm shadow-rose-500/50">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </div>
                  <span>Service Requests</span>
                  {pendingCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                      {pendingCount}
                    </span>
                  )}
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/analytics`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/analytics")
                      ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Analytics</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/menu`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/menu")
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
                  <span>Menu</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/tables`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/tables")
                      ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Tables & QR</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/coupons`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/coupons")
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <Ticket className="w-3.5 h-3.5 text-amber-400" />
                  <span>Coupons</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/subscription`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/subscription")
                      ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-purple-400" />
                  <span>Subscription</span>
                </Link>

                <Link
                  href={`/restaurants/${currentRestaurantId}/settings`}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
                    pathname.includes("/settings")
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  <Settings className="w-3.5 h-3.5 text-amber-400" />
                  <span>Settings & Reviews</span>
                </Link>
              </>
            )}

            <Link
              href="/restaurants/new"
              title="Add New Restaurant"
              className={`p-1.5 sm:px-2 sm:py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1 whitespace-nowrap flex-shrink-0 ${
                pathname === "/restaurants/new"
                  ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                  : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden xl:inline">Add Restaurant</span>
            </Link>
          </nav>
        </div>

        {/* Right Section: Sound/Notification Popover + User Profile & Logout */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Notification & Sound Alerts Popover */}
          {currentRestaurantId && !isCreatingNew && (
            <NotificationControlsPopover />
          )}

          <div className="flex items-center gap-2.5 pl-2 sm:pl-3 border-l border-slate-800">
            <div className="text-right hidden lg:block max-w-[160px]">
              <div className="text-xs font-semibold text-white truncate">{user.name}</div>
              <div className="text-[11px] text-slate-400 flex items-center justify-end gap-1.5">
                <span className="truncate max-w-[100px]">{user.email}</span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-slate-800 text-amber-400 border border-slate-700 flex-shrink-0">
                  {user.role === "RESTAURANT_OWNER" ? "Owner" : "Staff"}
                </span>
              </div>
            </div>

            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-700 flex-shrink-0">
              <UserCircle className="w-4 h-4 text-amber-400" />
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out of Restaurant Portal"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20 cursor-pointer flex-shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Sub-Navigation Bar */}
      {currentRestaurantId && !isCreatingNew && (
        <div className="md:hidden border-t border-slate-800/80 bg-slate-950/80 px-4 py-2 overflow-x-auto no-scrollbar flex items-center gap-2">
          <Link
            href={`/restaurants/${currentRestaurantId}/orders`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/orders")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <ChefHat className="w-3.5 h-3.5 text-amber-400" />
            <span>Orders</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/service-requests`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/service-requests")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <div className="relative flex items-center">
              <Bell className="w-3.5 h-3.5 text-amber-400" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-2 px-1 min-w-[14px] h-[14px] rounded-full text-[8px] font-black bg-rose-500 text-white flex items-center justify-center animate-pulse">
                  {pendingCount > 99 ? "99+" : pendingCount}
                </span>
              )}
            </div>
            <span>Requests</span>
            {pendingCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300">
                {pendingCount}
              </span>
            )}
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/tables`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/tables")
                ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <TableIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tables</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/menu`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/menu")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
            <span>Menu</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/analytics`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/analytics")
                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Analytics</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/coupons`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/coupons")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <Ticket className="w-3.5 h-3.5 text-amber-400" />
            <span>Coupons</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/subscription`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/subscription")
                ? "bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-purple-400" />
            <span>Subscription</span>
          </Link>

          <Link
            href={`/restaurants/${currentRestaurantId}/settings`}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 ${
              pathname.includes("/settings")
                ? "bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold"
                : "text-slate-400 hover:text-slate-200 bg-slate-900/50"
            }`}
          >
            <Settings className="w-3.5 h-3.5 text-amber-400" />
            <span>Settings & Reviews</span>
          </Link>
        </div>
      )}
    </header>
  );
}
