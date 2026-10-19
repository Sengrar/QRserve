"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, AlertCircle, CheckCircle2, KeyRound, Info, Loader2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [emailConfigured, setEmailConfigured] = useState<boolean>(true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to process password recovery request.");
        setLoading(false);
        return;
      }

      setSubmitted(true);
      setSuccessMessage(data.message);
      if (typeof data.emailConfigured === "boolean") {
        setEmailConfigured(data.emailConfigured);
      }
    } catch {
      setError("An unexpected network error occurred. Please check your connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-800 max-w-md w-full mx-auto">
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6 stroke-[2]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Reset Password</h1>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Enter your registered email address and we will dispatch a secure single-use recovery link.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {submitted ? (
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/25 space-y-2">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>Recovery Instructions Dispatched</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              {successMessage}
            </p>
            <p className="text-[11px] text-slate-400">
              For security reasons, recovery links are single-use and automatically expire in 15 minutes.
            </p>
          </div>

          {!emailConfigured && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-amber-300 text-xs">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <div>
                <p className="font-semibold text-amber-300">Development Environment Notice</p>
                <p className="text-slate-300 text-[11px] mt-0.5">
                  Production email delivery is unconfigured. In local development, the reset link has been output to your server terminal console. To send live emails on Vercel, configure <code className="text-amber-300 font-mono">RESEND_API_KEY</code> in your environment.
                </p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <Link
              href="/login"
              className="w-full py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 transition flex items-center justify-center gap-1.5 shadow-md shadow-amber-500/20"
            >
              Return to Sign In
            </Link>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="recovery-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
              Email Address
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                id="recovery-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="owner@restaurant.com"
                className="w-full glass-input rounded-xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email.trim()}
            className="w-full mt-2 py-2.5 px-4 rounded-xl font-semibold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                <span>Processing Request...</span>
              </>
            ) : (
              <span>Send Recovery Link</span>
            )}
          </button>
        </form>
      )}

      <div className="mt-6 pt-5 border-t border-slate-800/80 text-center">
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
