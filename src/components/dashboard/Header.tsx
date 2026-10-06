"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QrCode, Shield, LogOut, Store, UserCircle } from "lucide-react";
import { SessionUser } from "@/types";

interface HeaderProps {
  user: SessionUser;
}

export function Header({ user }: HeaderProps) {
  const router = useRouter();
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

  const isSuperAdmin = user.role === "SUPER_ADMIN";

  return (
    <header className="sticky top-0 z-40 w-full glass-panel border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/dashboard" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <QrCode className="w-5 h-5 text-slate-950" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 bg-clip-text text-transparent">
                QRServe
              </span>
              <span className="block text-[10px] uppercase tracking-wider font-semibold text-slate-400 -mt-1">
                Ordering Platform
              </span>
            </div>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/dashboard"
              className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-slate-200 hover:text-white hover:bg-slate-800/60 transition"
            >
              <span className="flex items-center gap-1.5">
                <Store className="w-4 h-4 text-amber-400" />
                Restaurants
              </span>
            </Link>

            {isSuperAdmin && (
              <Link
                href="/admin"
                className="px-3.5 py-1.5 rounded-lg text-sm font-medium text-purple-300 bg-purple-500/10 border border-purple-500/20 hover:bg-purple-500/20 transition flex items-center gap-1.5"
              >
                <Shield className="w-4 h-4 text-purple-400" />
                Super Admin Center
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 pl-4 border-l border-slate-800">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-medium text-slate-200">{user.name}</div>
              <div className="text-xs text-slate-400 flex items-center justify-end gap-1.5">
                <span>{user.email}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase bg-slate-800 text-amber-400">
                  {user.role === "SUPER_ADMIN" ? "Super Admin" : "Owner"}
                </span>
              </div>
            </div>

            <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 border border-slate-700">
              <UserCircle className="w-5 h-5 text-amber-400" />
            </div>

            <button
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="Log out"
              title="Log out"
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition border border-transparent hover:border-rose-500/20"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
