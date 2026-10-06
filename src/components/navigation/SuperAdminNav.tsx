"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ShieldCheck,
  Store,
  CreditCard,
  LogOut,
  UserCircle,
  Layers,
} from "lucide-react";
import { SessionUser } from "@/types";

interface SuperAdminNavProps {
  user: SessionUser;
}

export function SuperAdminNav({ user }: SuperAdminNavProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [loggingOut, setLoggingOut] = useState(false);

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

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-purple-900/40 bg-slate-950/90 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand & Super Admin Badge */}
        <div className="flex items-center gap-6">
          <Link href="/admin" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-purple-600 via-indigo-600 to-amber-500 flex items-center justify-center shadow-lg shadow-purple-600/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-purple-300 via-indigo-200 to-amber-300 bg-clip-text text-transparent">
                  QRServe
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  Super Admin
                </span>
              </div>
              <span className="block text-[10px] uppercase tracking-wider font-semibold text-slate-400 -mt-0.5">
                Platform Governance & Oversight
              </span>
            </div>
          </Link>

          {/* Navigation Items */}
          <nav className="hidden md:flex items-center gap-1.5 ml-4">
            <Link
              href="/admin"
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${
                pathname === "/admin"
                  ? "bg-purple-500/15 text-purple-200 border border-purple-500/30 shadow-sm shadow-purple-500/10"
                  : "text-slate-300 hover:text-white hover:bg-slate-800/60"
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <span>Platform Center</span>
            </Link>

            <Link
              href="/admin"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition flex items-center gap-1.5"
            >
              <Store className="w-3.5 h-3.5 text-amber-400" />
              <span>Restaurant Approvals</span>
            </Link>

            <Link
              href="/admin"
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:text-white hover:bg-slate-800/60 transition flex items-center gap-1.5"
            >
              <CreditCard className="w-3.5 h-3.5 text-emerald-400" />
              <span>Payments & Subs</span>
            </Link>
          </nav>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-white">{user.name}</div>
              <div className="text-xs text-slate-400 flex items-center justify-end gap-1.5">
                <span>{user.email}</span>
                <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800/60">
                  Super Admin
                </span>
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-purple-900 to-indigo-900 flex items-center justify-center text-purple-300 border border-purple-700/60 shadow-md">
              <UserCircle className="w-5 h-5 text-purple-300" />
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out of Super Admin"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
