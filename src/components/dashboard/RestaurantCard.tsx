"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ApprovalStatus } from "@prisma/client";
import { ApprovalBadge, ActivationBadge, SuspensionBadge } from "@/components/ui/Badge";
import { canPubliclyAccessRestaurant } from "@/lib/security/governance";
import {
  QrCode,
  ExternalLink,
  MapPin,
  Phone,
  AlertTriangle,
  CheckCircle2,
  Power,
  CreditCard,
  Table as TableIcon,
  UtensilsCrossed,
  ShoppingBag,
} from "lucide-react";

interface RestaurantCardProps {
  restaurant: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    googleReviewUrl: string | null;
    approvalStatus: ApprovalStatus;
    rejectionReason: string | null;
    isActive: boolean;
    isSuspended: boolean;
    createdAt: string | Date;
  };
  onStatusChange?: () => void;
}

export function RestaurantCard({ restaurant, onStatusChange }: RestaurantCardProps) {
  const [isActive, setIsActive] = useState(restaurant.isActive);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isApproved = restaurant.approvalStatus === ApprovalStatus.APPROVED;
  const isSuspended = restaurant.isSuspended;
  const canToggle = isApproved && !isSuspended;
  const isLive = canPubliclyAccessRestaurant({
    approvalStatus: restaurant.approvalStatus,
    isActive,
    isSuspended,
  });

  async function handleToggleActive() {
    if (!canToggle || loading) return;
    setLoading(true);
    setError(null);

    const nextState = !isActive;

    try {
      const res = await fetch(`/api/restaurants/${restaurant.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: nextState }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error || "Failed to update restaurant status.");
        return;
      }

      setIsActive(nextState);
      if (onStatusChange) onStatusChange();
    } catch (err) {
      console.error(err);
      setError("Network error while updating status.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="glass-card rounded-2xl p-6 border border-slate-800 hover:border-slate-700/80 transition-all flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white tracking-tight">{restaurant.name}</h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">/r/{restaurant.slug}</p>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap justify-end">
            <ApprovalBadge status={restaurant.approvalStatus} />
            <ActivationBadge isActive={isActive} />
            <SuspensionBadge isSuspended={restaurant.isSuspended} />
          </div>
        </div>

        {restaurant.description && (
          <p className="mt-3 text-xs text-slate-300 line-clamp-2">{restaurant.description}</p>
        )}

        <div className="mt-4 space-y-1.5 text-xs text-slate-400">
          {restaurant.address && (
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span className="truncate">{restaurant.address}</span>
            </div>
          )}
          {restaurant.phone && (
            <div className="flex items-center gap-2">
              <Phone className="w-3.5 h-3.5 text-slate-500" />
              <span>{restaurant.phone}</span>
            </div>
          )}
        </div>

        {/* Status Callout / Guidance */}
        <div className="mt-5 pt-4 border-t border-slate-800/80">
          {restaurant.isSuspended ? (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-400" />
              <div>
                <span className="font-semibold">Suspended by Super Admin:</span> Public QR ordering is halted. Please contact administration.
              </div>
            </div>
          ) : restaurant.approvalStatus === ApprovalStatus.PENDING ? (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-400" />
              <div>
                <span className="font-bold text-amber-300 block mb-0.5">
                  Pending Super Admin Approval
                </span>
                Your restaurant registration is currently awaiting review by the platform Super Admin.
                Daily ordering activation is locked until approved. You can still set up your menu and tables in the meantime.
              </div>
            </div>
          ) : restaurant.approvalStatus === ApprovalStatus.REJECTED ? (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-400" />
              <div>
                <span className="font-semibold">Approval Declined:</span> {restaurant.rejectionReason || "Requirements not met."}
              </div>
            </div>
          ) : !isActive ? (
            <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-slate-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <span className="font-semibold text-emerald-400">Approved & Ready:</span> Toggle activation to &ldquo;Active (Open)&rdquo; when you are ready to receive customer orders at your tables.
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <span className="font-semibold">Live for QR Ordering:</span> Customers scanning your table QRs can view your menu and submit orders to pay at your counter.
              </div>
            </div>
          )}

          {error && <p className="mt-2 text-xs text-rose-400 font-medium">{error}</p>}
        </div>
        {/* Quick Management Links */}
        <div className="mt-4 pt-3 border-t border-slate-800/60 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <Link
            href={`/restaurants/${restaurant.id}/orders`}
            className="px-2 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5 font-medium"
            title="Customer Orders"
          >
            <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
            <span>Orders</span>
          </Link>
          <Link
            href={`/restaurants/${restaurant.id}/menu`}
            className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5 font-medium"
            title="Menu & Category Management"
          >
            <UtensilsCrossed className="w-3.5 h-3.5 text-amber-400" />
            <span>Menu</span>
          </Link>
          <Link
            href={`/restaurants/${restaurant.id}/tables`}
            className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5 font-medium"
            title="Tables and QR Codes"
          >
            <TableIcon className="w-3.5 h-3.5 text-cyan-400" />
            <span>Tables</span>
          </Link>
          <Link
            href={`/restaurants/${restaurant.id}/subscription`}
            className="px-2.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition flex items-center justify-center gap-1.5 font-medium"
            title="Subscription and Billing"
          >
            <CreditCard className="w-3.5 h-3.5 text-purple-400" />
            <span>Billing</span>
          </Link>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3">
        {/* Activation Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleActive}
            disabled={!canToggle || loading}
            title={
              !isApproved
                ? "Approval required before activation"
                : isSuspended
                ? "Suspended by admin"
                : isActive
                ? "Click to deactivate (close restaurant ordering)"
                : "Click to activate (open restaurant ordering)"
            }
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
              !canToggle
                ? "bg-slate-800/40 text-slate-500 border border-slate-800 cursor-not-allowed"
                : isActive
                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 cursor-pointer"
                : "bg-slate-800 text-slate-300 border border-slate-700 hover:bg-slate-700 cursor-pointer"
            }`}
          >
            <Power className={`w-3.5 h-3.5 ${isActive ? "text-emerald-400" : "text-slate-400"}`} />
            {loading ? "Updating..." : isActive ? "Deactivate" : "Activate"}
          </button>
        </div>

        {/* Public QR Status Link */}
        <a
          href={`/api/r/${restaurant.slug}`}
          target="_blank"
          rel="noreferrer"
          className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition ${
            isLive
              ? "text-amber-400 hover:text-amber-300 bg-amber-500/10 border border-amber-500/20"
              : "text-slate-400 hover:text-slate-300 bg-slate-800/40 border border-slate-800"
          }`}
        >
          <QrCode className="w-3.5 h-3.5" />
          <span>{isLive ? "Test QR Route" : "Preview API"}</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
