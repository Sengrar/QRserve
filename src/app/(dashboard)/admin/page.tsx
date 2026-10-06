import React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSuperAdmin, AuthenticationError } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { AdminDashboardTabs } from "@/components/admin/AdminDashboardTabs";
import { evaluateSubscriptionStatus } from "@/lib/subscription/status";
import { ShieldCheck, ShieldAlert, Store, Clock, CreditCard } from "lucide-react";
import { ApprovalStatus, PaymentRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Enforce server-side Super Admin privilege check
  try {
    await requireSuperAdmin();
  } catch (error) {
    if (error instanceof AuthenticationError) {
      redirect("/login?from=/admin");
    }
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-4">
        <div className="glass-card max-w-md w-full p-8 rounded-2xl border border-rose-500/20 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white">Super Admin Access Denied</h2>
          <p className="text-sm text-slate-400">
            {error instanceof Error ? error.message : "Only the designated Super Admin account can access this panel."}
          </p>
          <div className="pt-4 flex flex-col gap-2">
            <Link
              href="/login?switch=true"
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 transition"
            >
              Sign In with Designated Account
            </Link>
            <Link
              href="/dashboard"
              className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
            >
              Return to Restaurant Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const [restaurants, subscriptions, paymentRequests, paymentConfig] = await Promise.all([
    prisma.restaurant.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        },
      },
    }),
    prisma.subscription.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            approvalStatus: true,
            isActive: true,
            isSuspended: true,
          },
        },
      },
    }),
    prisma.subscriptionPaymentRequest.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        restaurant: {
          select: {
            id: true,
            name: true,
            slug: true,
            approvalStatus: true,
          },
        },
        reviewedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    }),
    prisma.systemPaymentConfig.findFirst({
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pendingApprovalsCount = restaurants.filter(
    (r) => r.approvalStatus === ApprovalStatus.PENDING
  ).length;
  const suspendedCount = restaurants.filter((r) => r.isSuspended).length;

  const pendingPaymentsCount = paymentRequests.filter(
    (r) => r.status === PaymentRequestStatus.PENDING
  ).length;
  const activeSubsCount = subscriptions.filter(
    (s) => evaluateSubscriptionStatus(s).isValid
  ).length;

  const defaultPaymentConfig = paymentConfig
    ? {
        upiId: paymentConfig.upiId,
        payeeName: paymentConfig.payeeName,
        bankName: paymentConfig.bankName,
        accountNumber: paymentConfig.accountNumber,
        ifscCode: paymentConfig.ifscCode,
        accountType: paymentConfig.accountType,
        instructions: paymentConfig.instructions,
      }
    : {
        upiId: "qrserve@upi",
        payeeName: "QRServe Platform",
        bankName: "HDFC Bank",
        accountNumber: "50200012345678",
        ifscCode: "HDFC0001234",
        accountType: "Current Account",
        instructions:
          "Please mention your Restaurant Name or Slug in the remarks. Enter the 12-digit UTR/Transaction Reference number after completing payment.",
      };

  const formattedSubscriptions = subscriptions.map((s) => ({
    id: s.id,
    restaurantId: s.restaurantId,
    plan: s.plan,
    status: s.status,
    billingPeriod: s.billingPeriod,
    currency: s.currency,
    customMonthlyPrice: Number(s.customMonthlyPrice),
    customYearlyPrice: Number(s.customYearlyPrice),
    paymentStatus: s.paymentStatus,
    nextBillingDate: s.nextBillingDate ? s.nextBillingDate.toISOString() : null,
    tableLimit: s.tableLimit,
    amount: Number(s.amount),
    startDate: s.startDate.toISOString(),
    endDate: s.endDate.toISOString(),
    notes: s.notes,
    evaluated: evaluateSubscriptionStatus(s),
    restaurant: s.restaurant,
  }));

  const formattedPaymentRequests = paymentRequests.map((r) => ({
    id: r.id,
    restaurantId: r.restaurantId,
    plan: r.plan,
    billingPeriod: r.billingPeriod,
    tableCount: r.tableCount,
    amount: Number(r.amount),
    amountPaise: r.amountPaise,
    paymentMethod: r.paymentMethod,
    utrReference: r.utrReference,
    proofUrl: r.proofUrl,
    notes: r.notes,
    status: r.status,
    adminNotes: r.adminNotes,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
    restaurant: r.restaurant,
    reviewedBy: r.reviewedBy,
  }));

  const formattedRestaurants = restaurants.map((r) => ({
    ...r,
    taxRate: Number(r.taxRate),
  }));

  return (
    <div className="space-y-8">
      {/* Super Admin Title & Summary */}
      <div>
        <div className="flex items-center gap-2 text-purple-400 text-xs font-semibold uppercase tracking-wider mb-1">
          <ShieldCheck className="w-4 h-4" />
          <span>Super Admin Governance Center</span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-white">
          Platform Oversight & Subscriptions
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Super Admin oversight for restaurant approvals, offline subscription payment verification, and table limit management.
        </p>
      </div>

      {/* Admin KPI stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Pending Approvals
            </span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">{pendingApprovalsCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Restaurant vetting</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Pending Payments
            </span>
            <CreditCard className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-orange-400">{pendingPaymentsCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">UTR verification</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">
              Active Subscriptions
            </span>
            <Store className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">{activeSubsCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Valid subscriber floors</div>
        </div>

        <div className="glass-card rounded-2xl p-5 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Suspended</span>
            <ShieldAlert className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400">{suspendedCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Ordering halted</div>
        </div>
      </div>

      {/* Main Tabs Container */}
      <AdminDashboardTabs
        restaurants={formattedRestaurants}
        subscriptions={formattedSubscriptions}
        paymentRequests={formattedPaymentRequests}
        paymentConfig={defaultPaymentConfig}
        pendingApprovalsCount={pendingApprovalsCount}
        pendingPaymentsCount={pendingPaymentsCount}
      />
    </div>
  );
}
