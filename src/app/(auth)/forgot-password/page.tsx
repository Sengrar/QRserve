"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, AlertCircle, CheckCircle2, ArrowRight, KeyRound } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetUrl, setResetUrl] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process password reset request.");
        setLoading(false);
        return;
      }

      setSuccessMessage(data.message);
      if (data.resetUrl) {
        setResetUrl(data.resetUrl);
      }
      setLoading(false);
    } catch (err) {
      console.error(err);
      setError("An unexpected network error occurred.");
      setLoading(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-800">
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6 stroke-[2]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-400">
          Enter your registered email address and we will help you reset your password.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-3 text-rose-400 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="mb-6 space-y-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-start gap-3 text-emerald-300 text-sm">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0 mt-0.5 text-emerald-400" />
            <div>
              <p className="font-semibold">{successMessage}</p>
              <p className="text-xs text-emerald-400/80 mt-1">
                The link is valid for 15 minutes.
              </p>
            </div>
          </div>

          {resetUrl && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-amber-500/30 space-y-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400 block">
                Reset Link Ready:
              </span>
              <Link
                href={resetUrl}
                className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
              >
                <span>Proceed to Set New Password</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          )}
        </div>
      )}

      {!resetUrl && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your-email@example.com"
                className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-3 px-4 rounded-xl font-semibold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <span className="inline-block w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Generate Reset Link</span>
            )}
          </button>
        </form>
      )}

      <div className="mt-6 pt-6 border-t border-slate-800/80 text-center">
        <Link
          href="/login"
          className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5 transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
