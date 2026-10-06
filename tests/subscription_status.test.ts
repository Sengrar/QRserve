import { describe, it, expect } from "vitest";
import {
  evaluateSubscriptionStatus,
  calculateSubscriptionCycleDates,
  SUBSCRIPTION_DURATION_DAYS,
} from "@/lib/subscription/status";
import { SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

describe("Subscription Status Evaluation & Expiry Cycles", () => {
  it("identifies an active valid subscription with future expiry", () => {
    const futureDate = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000); // 20 days ahead
    const status = evaluateSubscriptionStatus({
      plan: SubscriptionPlan.MEDIUM,
      status: SubscriptionStatus.ACTIVE,
      tableLimit: 10,
      endDate: futureDate,
    });

    expect(status.hasSubscription).toBe(true);
    expect(status.isValid).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(status.isSuspended).toBe(false);
    expect(status.isNearExpiry).toBe(false);
    expect(status.daysRemaining).toBe(20);
    expect(status.tableLimit).toBe(10);
  });

  it("detects near-expiry warning when <= 7 days remain", () => {
    const nearDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days ahead
    const status = evaluateSubscriptionStatus({
      plan: SubscriptionPlan.SMALL,
      status: SubscriptionStatus.ACTIVE,
      tableLimit: 5,
      endDate: nearDate,
    });

    expect(status.isValid).toBe(true);
    expect(status.isNearExpiry).toBe(true);
    expect(status.daysRemaining).toBe(5);
  });

  it("treats active subscription whose endDate is in the past as EXPIRED (no silent renewal)", () => {
    const pastDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000); // 2 days ago
    const status = evaluateSubscriptionStatus({
      plan: SubscriptionPlan.SMALL,
      status: SubscriptionStatus.ACTIVE,
      tableLimit: 5,
      endDate: pastDate,
    });

    expect(status.isValid).toBe(false);
    expect(status.isExpired).toBe(true);
    expect(status.daysRemaining).toBe(0);
    expect(status.status).toBe(SubscriptionStatus.EXPIRED);
  });

  it("identifies administratively suspended subscriptions", () => {
    const futureDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const status = evaluateSubscriptionStatus({
      plan: SubscriptionPlan.LARGE,
      status: SubscriptionStatus.SUSPENDED,
      tableLimit: 25,
      endDate: futureDate,
    });

    expect(status.isValid).toBe(false);
    expect(status.isSuspended).toBe(true);
  });

  describe("Renewal cycle calculations", () => {
    it("extends from existing endDate on early renewal", () => {
      const currentEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000); // 10 days remaining
      const cycle = calculateSubscriptionCycleDates({
        status: SubscriptionStatus.ACTIVE,
        endDate: currentEnd,
      });

      // New end should be currentEnd + 30 days (40 days from now)
      const expectedEnd = new Date(currentEnd.getTime() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000);
      expect(Math.abs(cycle.endDate.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });

    it("starts fresh 30 days from now when renewing an expired subscription", () => {
      const pastEnd = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days expired
      const cycle = calculateSubscriptionCycleDates({
        status: SubscriptionStatus.EXPIRED,
        endDate: pastEnd,
      });

      const expectedEnd = new Date(Date.now() + SUBSCRIPTION_DURATION_DAYS * 24 * 60 * 60 * 1000);
      expect(Math.abs(cycle.endDate.getTime() - expectedEnd.getTime())).toBeLessThan(1000);
    });
  });
});
