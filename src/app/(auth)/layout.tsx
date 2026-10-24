import React from "react";
import Link from "next/link";
import { QrCode } from "lucide-react";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden bg-slate-950">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-orange-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="mb-8 text-center relative z-10">
        <Link href="/" className="inline-flex items-center gap-3 group">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 flex items-center justify-center shadow-xl shadow-amber-500/25 group-hover:scale-105 transition-transform">
            <QrCode className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <span className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-orange-300 to-amber-400 bg-clip-text text-transparent">
            QRServe
          </span>
        </Link>
        <p className="mt-2 text-sm text-slate-400 font-medium">
          Multi-Tenant Digital Restaurant QR Platform
        </p>
      </div>

      <div className="w-full max-w-md relative z-10">{children}</div>

      <div className="mt-8 text-center text-xs text-slate-500 relative z-10 space-y-2">
        <p>Direct QR table ordering • Pay at counter • Zero subscription fees</p>
        <p>
          <Link href="/terms" className="text-slate-400 hover:text-amber-400 underline underline-offset-2 transition">
            Terms & Conditions
          </Link>
        </p>
      </div>
    </div>
  );
}
