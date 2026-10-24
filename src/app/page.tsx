import React from "react";
import Link from "next/link";
import {
  QrCode,
  ShieldCheck,
  Zap,
  ArrowRight,
  CreditCard,
  Star,
  CheckCircle2,
} from "lucide-react";

export default function HomePage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-amber-500/20 selection:text-amber-300">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 glass-panel border-b border-slate-800/80 bg-slate-950/70 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
              <QrCode className="w-5 h-5 text-slate-950 stroke-[2.5]" />
            </div>
            <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-amber-300 via-orange-300 to-amber-400 bg-clip-text text-transparent">
              QRServe
            </span>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition"
            >
              Sign In
            </Link>
            <Link
              href="/register"
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition shadow-lg shadow-amber-500/20"
            >
              Register Restaurant
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section className="relative pt-20 pb-28 px-4 sm:px-6 lg:px-8 overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-12 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-amber-500/15 via-orange-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="max-w-4xl mx-auto text-center relative z-10">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium bg-amber-500/10 border border-amber-500/20 text-amber-300 mb-6">
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Multi-Tenant Restaurant Platform • Zero Commission & Zero Subscriptions</span>
            </div>

            <h1 className="text-4xl sm:text-6xl font-black tracking-tight text-white leading-tight">
              Table QR Ordering.{" "}
              <span className="bg-gradient-to-r from-amber-300 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                Pay at Counter.
              </span>
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
              QRServe gives restaurant owners a clean, modern digital menu and table QR ordering platform. No subscriptions, no payment processing fees, and full multi-tenant admin oversight.
            </p>

            <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                href="/register"
                className="w-full sm:w-auto px-8 py-3.5 rounded-xl font-bold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition shadow-xl shadow-amber-500/20 flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Get Started as Restaurant Owner</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
              <Link
                href="/login"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl font-semibold text-sm text-slate-200 glass-card hover:bg-slate-800/80 transition border border-slate-700/80"
              >
                Dashboard Login
              </Link>
            </div>
          </div>
        </section>

        {/* Core Principles Grid */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 border-t border-slate-900">
          <div className="text-center max-w-2xl mx-auto mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
              Built on Honest, Transparent Architecture
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              No hidden fees, no credit card required, and strict multi-tenant data separation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="glass-card rounded-2xl p-7 border border-slate-800/90 relative">
              <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-5">
                <CreditCard className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Subscriptions or Gateway Fees</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Zero pricing models. Zero gateway transaction percentages. Customers place their orders at their table through the QR code and pay directly at your counter.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-7 border border-slate-800/90 relative">
              <div className="w-12 h-12 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Separate Approval & Activation</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every newly registered restaurant requires Super Admin vetting. Once approved, the restaurant owner independently controls their active status with safety kill-switch controls.
              </p>
            </div>

            <div className="glass-card rounded-2xl p-7 border border-slate-800/90 relative">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-5">
                <Star className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">Google Reviews Integration</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Seamlessly channel happy diners from the digital ordering experience directly to your Google Business Profile to boost genuine local reviews.
              </p>
            </div>
          </div>
        </section>

        {/* Verification Architecture Banner */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="glass-panel rounded-3xl p-8 sm:p-10 border border-slate-800 relative overflow-hidden">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 uppercase tracking-wider">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Phase 1 Architecture Complete</span>
                </div>
                <h3 className="text-2xl font-bold text-white">
                  Multi-Tenant Security & Role Isolation
                </h3>
                <p className="text-xs text-slate-400 max-w-xl">
                  Robust PostgreSQL + Prisma schema, Zod input validation, Bcrypt password hashing, signed HttpOnly JWT sessions, and strict tenant access barriers.
                </p>
              </div>

              <Link
                href="/register"
                className="px-6 py-3 rounded-xl text-xs font-bold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition whitespace-nowrap"
              >
                Register Your Restaurant
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p>QRServe Multi-Tenant Digital QR Platform • Direct Table Ordering & Counter Billing</p>
          <div className="flex items-center gap-6">
            <Link href="/terms" className="hover:text-amber-400 transition">
              Terms & Conditions
            </Link>
            <Link href="/login" className="hover:text-slate-300 transition">
              Dashboard Login
            </Link>
            <Link href="/register" className="hover:text-slate-300 transition">
              Register
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
