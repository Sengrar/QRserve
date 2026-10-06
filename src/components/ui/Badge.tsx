import React from "react";
import { ApprovalStatus } from "@prisma/client";

interface ApprovalBadgeProps {
  status: ApprovalStatus;
}

export function ApprovalBadge({ status }: ApprovalBadgeProps) {
  switch (status) {
    case ApprovalStatus.APPROVED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Approved
        </span>
      );
    case ApprovalStatus.PENDING:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          Pending Approval
        </span>
      );
    case ApprovalStatus.REJECTED:
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/10 text-rose-400 border border-rose-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
          Rejected
        </span>
      );
    default:
      return null;
  }
}

interface ActivationBadgeProps {
  isActive: boolean;
}

export function ActivationBadge({ isActive }: ActivationBadgeProps) {
  if (isActive) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        Active (Open)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-500/10 text-slate-400 border border-slate-500/20">
      <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
      Inactive (Closed)
    </span>
  );
}

interface SuspensionBadgeProps {
  isSuspended: boolean;
}

export function SuspensionBadge({ isSuspended }: SuspensionBadgeProps) {
  if (!isSuspended) return null;
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-600/20 text-red-300 border border-red-500/40">
      Suspended
    </span>
  );
}
