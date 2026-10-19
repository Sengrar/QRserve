"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock, Eye, EyeOff, CheckCircle2, AlertCircle, ArrowRight, KeyRound, Loader2, Check } from "lucide-react";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Requirements checks
  const hasMinLength = password.length >= 8;
  const hasLetter = /[A-Za-z]/.test(password);
  const hasNumber = /[0-9]/.test(password);
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const isFormValid = hasMinLength && hasLetter && hasNumber && passwordsMatch;

  if (!token) {
    return (
      <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-800 text-center space-y-4 max-w-md w-full mx-auto">
        <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-white">Missing or Invalid Token</h2>
        <p className="text-xs text-slate-400 leading-relaxed">
          This password reset link is invalid, incomplete, or may have expired. Please request a new recovery link.
        </p>
        <div className="pt-2">
          <Link
            href="/forgot-password"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-xs text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
          >
            Request New Reset Link
          </Link>
        </div>
      </div>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!hasMinLength) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!hasLetter || !hasNumber) {
      setError("Password must contain both letters and numbers.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to reset password. The link may have expired or was already used.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      setLoading(false);
    } catch {
      setError("An unexpected network error occurred. Please verify your connection.");
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="glass-card rounded-2xl p-8 shadow-2xl border border-emerald-500/30 text-center space-y-5 max-w-md w-full mx-auto">
        <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mx-auto flex items-center justify-center shadow-lg shadow-emerald-500/10">
          <CheckCircle2 className="w-8 h-8 stroke-[2.2]" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-white">Password Updated!</h2>
          <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">
            Your new password has been securely saved and existing sessions were revoked. You can now sign in with your updated credentials.
          </p>
        </div>
        <Link
          href="/login"
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
        >
          <span>Sign In to Your Account</span>
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl p-8 shadow-2xl border border-slate-800 max-w-md w-full mx-auto">
      <div className="mb-6">
        <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
          <KeyRound className="w-6 h-6 stroke-[2]" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-white">Set New Password</h1>
        <p className="mt-1 text-xs text-slate-400 leading-relaxed">
          Create a secure new password for your restaurant management account.
        </p>
      </div>

      {error && (
        <div className="mb-6 p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start gap-2.5 text-rose-400 text-xs">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            New Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="new-password"
              type={showPassword ? "text" : "password"}
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full glass-input rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition focus:outline-none cursor-pointer"
              title={showPassword ? "Hide password" : "Show password"}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="confirm-new-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5">
            Confirm New Password
          </label>
          <div className="relative">
            <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              id="confirm-new-password"
              type={showConfirm ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full glass-input rounded-xl pl-10 pr-10 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition focus:outline-none cursor-pointer"
              title={showConfirm ? "Hide password" : "Show password"}
              aria-label={showConfirm ? "Hide password" : "Show password"}
            >
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4 text-slate-400" />}
            </button>
          </div>
        </div>

        {/* Live Password Checklist */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 text-[11px] space-y-1.5">
          <div className={`flex items-center gap-1.5 ${hasMinLength ? "text-emerald-400" : "text-slate-500"}`}>
            <Check className={`w-3.5 h-3.5 ${hasMinLength ? "opacity-100" : "opacity-40"}`} />
            <span>At least 8 characters long</span>
          </div>
          <div className={`flex items-center gap-1.5 ${hasLetter && hasNumber ? "text-emerald-400" : "text-slate-500"}`}>
            <Check className={`w-3.5 h-3.5 ${hasLetter && hasNumber ? "opacity-100" : "opacity-40"}`} />
            <span>Contains both letters and numbers</span>
          </div>
          {confirmPassword.length > 0 && (
            <div className={`flex items-center gap-1.5 ${passwordsMatch ? "text-emerald-400" : "text-rose-400"}`}>
              <Check className={`w-3.5 h-3.5 ${passwordsMatch ? "opacity-100" : "opacity-40"}`} />
              <span>Passwords match</span>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={loading || !isFormValid}
          className="w-full mt-2 py-2.5 px-4 rounded-xl font-bold text-xs text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 transition flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              <span>Updating Password...</span>
            </>
          ) : (
            <span>Save New Password</span>
          )}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="glass-card rounded-2xl p-8 border border-slate-800 text-center text-slate-400 text-xs max-w-md w-full mx-auto">
          Loading password recovery form...
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
