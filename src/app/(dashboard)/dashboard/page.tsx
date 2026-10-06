import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus } from "@prisma/client";
import { isUserDesignatedSuperAdmin } from "@/lib/security/tenant";
import { RestaurantCard } from "@/components/dashboard/RestaurantCard";
import { AccountDangerZone } from "@/components/dashboard/AccountDangerZone";
import { Plus, Store, CheckCircle2, Clock, QrCode } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) return null;

  // Super Admin must manage platform-level operations at /admin, not use the restaurant owner's dashboard
  if (isUserDesignatedSuperAdmin(sessionUser)) {
    redirect("/admin");
  }

  // Multi-tenant data isolation:
  // Fetch only restaurants where the user is an authorized member
  const restaurants = (
    await prisma.restaurantMember.findMany({
      where: { userId: sessionUser.id },
      include: { restaurant: true },
      orderBy: { createdAt: "desc" },
    })
  ).map((m) => ({
    ...m.restaurant,
    taxRate: Number(m.restaurant.taxRate),
  }));

  const total = restaurants.length;
  const approved = restaurants.filter((r) => r.approvalStatus === ApprovalStatus.APPROVED).length;
  const pending = restaurants.filter((r) => r.approvalStatus === ApprovalStatus.PENDING).length;
  const live = restaurants.filter(
    (r) => r.approvalStatus === ApprovalStatus.APPROVED && r.isActive && !r.isSuspended
  ).length;

  return (
    <div className="space-y-8">
      {/* Welcome & Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-white">
            Welcome back, {sessionUser.name}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Manage your restaurants, monitor Super Admin approvals, and toggle QR ordering.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/restaurants/new"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            Register Restaurant
          </Link>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Restaurants</span>
            <Store className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{total}</div>
          <div className="text-[11px] text-slate-400 mt-1">Under your account</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Approved</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-white">{approved}</div>
          <div className="text-[11px] text-emerald-400/80 mt-1">Verified by Admin</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Pending Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-white">{pending}</div>
          <div className="text-[11px] text-amber-400/80 mt-1">Awaiting Super Admin</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Live & Active</span>
            <QrCode className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">{live}</div>
          <div className="text-[11px] text-cyan-400/80 mt-1">Accepting QR Orders</div>
        </div>
      </div>

      {/* Restaurant List Section */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold tracking-tight text-white">Your Restaurants</h2>
          <span className="text-xs text-slate-400">
            {total} {total === 1 ? "restaurant" : "restaurants"} registered
          </span>
        </div>

        {restaurants.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center border border-dashed border-slate-800 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
              <Store className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">No Restaurants Registered Yet</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mt-1">
                Register your restaurant to begin. Once submitted, our Super Admin team will verify your details and approve your account.
              </p>
            </div>
            <Link
              href="/restaurants/new"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 transition"
            >
              <Plus className="w-4 h-4" />
              Register Your First Restaurant
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {restaurants.map((restaurant) => (
              <RestaurantCard key={restaurant.id} restaurant={restaurant} />
            ))}
          </div>
        )}
      </section>

      {/* Account Settings / Danger Zone */}
      <section className="pt-8 border-t border-slate-900">
        <AccountDangerZone userEmail={sessionUser.email} />
      </section>
    </div>
  );
}
