"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2, AlertTriangle, Eye, EyeOff, Lock, X } from "lucide-react";

interface AccountDangerZoneProps {
  userEmail: string;
}

export function AccountDangerZone({ userEmail }: AccountDangerZoneProps) {
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to delete account. Please try again.");
        setLoading(false);
        return;
      }

      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError("An unexpected network error occurred.");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl p-6 bg-slate-900/60 border border-slate-800 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400" />
            <span>Danger Zone — Delete Account</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Permanently delete your account (<span className="text-slate-300 font-medium">{userEmail}</span>) and all associated restaurants, menus, tables, and subscription details. This action cannot be reversed.
          </p>
        </div>

        <button
          onClick={() => {
            setError(null);
            setPassword("");
            setIsOpen(true);
          }}
          className="px-4 py-2.5 rounded-xl text-xs font-semibold text-rose-300 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 transition flex items-center justify-center gap-2 hover:border-rose-500/50 cursor-pointer flex-shrink-0"
        >
          <Trash2 className="w-3.5 h-3.5 text-rose-400" />
          <span>Delete Account</span>
        </button>
      </div>

      {/* Confirmation Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="glass-card max-w-md w-full p-6 rounded-2xl border border-rose-500/30 shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 bg-slate-950">
            <button
              onClick={() => setIsOpen(false)}
              className="absolute right-4 top-4 text-slate-500 hover:text-slate-300 transition"
              aria-label="Close dialog"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="w-12 h-12 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center justify-center mb-4">
              <Trash2 className="w-6 h-6 stroke-[2]" />
            </div>

            <h2 className="text-lg font-bold text-white">Permanently Delete Account?</h2>
            <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
              This will permanently delete your account, your owned restaurants, table QR codes, and active subscriptions. This action cannot be undone.
            </p>

            {error && (
              <div className="mt-4 p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs">
                {error}
              </div>
            )}

            <form onSubmit={handleDelete} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
                  Confirm Your Password
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your current password"
                    className="w-full glass-input rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none border border-slate-800 focus:border-rose-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition focus:outline-none cursor-pointer"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-800 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition flex items-center gap-1.5 shadow-lg shadow-rose-900/40 disabled:opacity-50 cursor-pointer"
                >
                  {loading ? (
                    <span className="inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Permanently Delete</span>
                    </>
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
