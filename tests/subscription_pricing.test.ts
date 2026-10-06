import { describe, it, expect } from "vitest";
import {
  calculatePlanPricing,
  verifyClaimedPricing,
  SMALL_PLAN_PRICE_RUPEES,
  SMALL_PLAN_MAX_TABLES,
  MEDIUM_PLAN_PRICE_RUPEES,
  MEDIUM_PLAN_MAX_TABLES,
} from "@/lib/subscription/pricing";
import { SubscriptionPlan } from "@prisma/client";

describe("Monthly Subscription Pricing Models", () => {
  describe("Small Restaurant Plan", () => {
    it("correctly prices Small plan at ₹499 with 5 tables limit", () => {
      const pricing = calculatePlanPricing(SubscriptionPlan.SMALL);

      expect(pricing.plan).toBe(SubscriptionPlan.SMALL);
      expect(pricing.tableLimit).toBe(SMALL_PLAN_MAX_TABLES);
      expect(pricing.tableLimit).toBe(5);
      expect(pricing.amountInRupees).toBe(SMALL_PLAN_PRICE_RUPEES);
      expect(pricing.amountInRupees).toBe(499);
      expect(pricing.amountInPaise).toBe(49900);
    });

    it("verifies matching amount in paise for Small plan", () => {
      expect(verifyClaimedPricing(SubscriptionPlan.SMALL, undefined, 49900)).toBe(true);
      expect(verifyClaimedPricing(SubscriptionPlan.SMALL, undefined, 49800)).toBe(false);
      expect(verifyClaimedPricing(SubscriptionPlan.SMALL, undefined, 50000)).toBe(false);
    });
  });

  describe("Medium Restaurant Plan", () => {
    it("correctly prices Medium plan at ₹999 with 10 tables limit", () => {
      const pricing = calculatePlanPricing(SubscriptionPlan.MEDIUM);

      expect(pricing.plan).toBe(SubscriptionPlan.MEDIUM);
      expect(pricing.tableLimit).toBe(MEDIUM_PLAN_MAX_TABLES);
      expect(pricing.tableLimit).toBe(10);
      expect(pricing.amountInRupees).toBe(MEDIUM_PLAN_PRICE_RUPEES);
      expect(pricing.amountInRupees).toBe(999);
      expect(pricing.amountInPaise).toBe(99900);
    });

    it("verifies matching amount in paise for Medium plan", () => {
      expect(verifyClaimedPricing(SubscriptionPlan.MEDIUM, undefined, 99900)).toBe(true);
      expect(verifyClaimedPricing(SubscriptionPlan.MEDIUM, undefined, 99800)).toBe(false);
    });
  });

  describe("Large Restaurant Plan (Per-Table Scaling)", () => {
    it("correctly calculates price at ₹100 per table for custom quantities", () => {
      // 1 table
      const p1 = calculatePlanPricing(SubscriptionPlan.LARGE, 1);
      expect(p1.tableLimit).toBe(1);
      expect(p1.amountInRupees).toBe(100);
      expect(p1.amountInPaise).toBe(10000);

      // 15 tables (common medium-large dining hall)
      const p15 = calculatePlanPricing(SubscriptionPlan.LARGE, 15);
      expect(p15.tableLimit).toBe(15);
      expect(p15.amountInRupees).toBe(1500);
      expect(p15.amountInPaise).toBe(150000);

      // 40 tables (large banquet hall)
      const p40 = calculatePlanPricing(SubscriptionPlan.LARGE, 40);
      expect(p40.tableLimit).toBe(40);
      expect(p40.amountInRupees).toBe(4000);
      expect(p40.amountInPaise).toBe(400000);
    });

    it("rejects invalid table counts for Large plan", () => {
      expect(() => calculatePlanPricing(SubscriptionPlan.LARGE, 0)).toThrow(
        "Large plan requires selecting at least 1 table."
      );
      expect(() => calculatePlanPricing(SubscriptionPlan.LARGE, -5)).toThrow(
        "Large plan requires selecting at least 1 table."
      );
      expect(() => calculatePlanPricing(SubscriptionPlan.LARGE, undefined)).toThrow(
        "Large plan requires selecting at least 1 table."
      );
    });

    it("verifies client claimed amount against server calculation for Large plan", () => {
      expect(verifyClaimedPricing(SubscriptionPlan.LARGE, 12, 120000)).toBe(true);
      expect(verifyClaimedPricing(SubscriptionPlan.LARGE, 12, 100000)).toBe(false); // Tampered price
    });
  });
});
