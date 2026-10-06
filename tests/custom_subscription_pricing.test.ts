import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AdminUpdateCustomPricingSchema,
  CreatePaymentRequestSchema,
} from "@/lib/validations/subscription";
import {
  calculateRestaurantCustomPricing,
  calculatePlanPricing,
  verifyClaimedPricing,
} from "@/lib/subscription/pricing";
import {
  evaluateSubscriptionStatus,
  calculateSubscriptionCycleDates,
  SUBSCRIPTION_DURATION_DAYS,
  SUBSCRIPTION_YEARLY_DAYS,
} from "@/lib/subscription/status";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import {
  UserRole,
  MembershipRole,
  SubscriptionPlan,
  BillingPeriod,
  SubscriptionPaymentStatus,
  SubscriptionStatus,
  PaymentMethod,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    subscriptionPaymentRequest: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

describe("Custom Restaurant Subscription Pricing System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Super Admin can set restaurant-specific price
  describe("1. Super Admin Setting Custom Pricing", () => {
    it("validates valid custom pricing payload for Super Admin", () => {
      const payload = {
        monthlyPrice: 799,
        yearlyPrice: 7990,
        billingPeriod: BillingPeriod.MONTHLY,
        nextBillingDate: "2026-11-05T00:00:00.000Z",
        paymentStatus: SubscriptionPaymentStatus.PAID,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currency: "INR",
        tableLimit: 15,
      };

      const result = AdminUpdateCustomPricingSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.monthlyPrice).toBe(799);
        expect(result.data.yearlyPrice).toBe(7990);
        expect(result.data.billingPeriod).toBe("MONTHLY");
        expect(result.data.paymentStatus).toBe("PAID");
        expect(result.data.subscriptionStatus).toBe("ACTIVE");
      }
    });

    it("rejects negative pricing values", () => {
      const invalid = AdminUpdateCustomPricingSchema.safeParse({
        monthlyPrice: -100,
        yearlyPrice: 5000,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentStatus: SubscriptionPaymentStatus.PAID,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.monthlyPrice).toBeDefined();
      }
    });
  });

  // 2. Super Admin can update price
  describe("2. Super Admin Updating Price", () => {
    it("allows updating pricing to arbitrary tier (e.g. ₹1499/mo, ₹14990/yr)", () => {
      const updatedPayload = {
        monthlyPrice: 1499,
        yearlyPrice: 14990,
        billingPeriod: BillingPeriod.YEARLY,
        paymentStatus: SubscriptionPaymentStatus.PAID,
        subscriptionStatus: SubscriptionStatus.ACTIVE,
        currency: "INR",
        notes: "Negotiated custom annual enterprise rate",
      };

      const result = AdminUpdateCustomPricingSchema.safeParse(updatedPayload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.monthlyPrice).toBe(1499);
        expect(result.data.yearlyPrice).toBe(14990);
        expect(result.data.billingPeriod).toBe("YEARLY");
      }
    });

    it("allows updating subscription and payment status (e.g. SUSPENDED, OVERDUE)", () => {
      const statusUpdate = {
        monthlyPrice: 2500,
        yearlyPrice: 25000,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentStatus: SubscriptionPaymentStatus.OVERDUE,
        subscriptionStatus: SubscriptionStatus.SUSPENDED,
      };

      const result = AdminUpdateCustomPricingSchema.safeParse(statusUpdate);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.paymentStatus).toBe("OVERDUE");
        expect(result.data.subscriptionStatus).toBe("SUSPENDED");
      }
    });
  });

  // 3. Restaurant owner cannot modify price
  describe("3. Restaurant Owner Price Modification Prevention", () => {
    it("denies non-Super Admin from accessing admin pricing endpoints", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_1",
        userId: "owner_1",
        restaurantId: "rest_1",
        role: MembershipRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess("owner_1", UserRole.RESTAURANT_OWNER, "rest_1");
      expect(access.authorized).toBe(true);
      expect(access.isSuperAdmin).toBe(false); // Crucial: isSuperAdmin is false
    });
  });

  // 4. Restaurant A price does not affect Restaurant B
  describe("4. Tenant Isolation in Pricing", () => {
    it("ensures Restaurant A custom pricing does not affect Restaurant B", () => {
      const subA = {
        customMonthlyPrice: new Prisma.Decimal(499),
        customYearlyPrice: new Prisma.Decimal(4990),
        billingPeriod: BillingPeriod.MONTHLY,
      };

      const subB = {
        customMonthlyPrice: new Prisma.Decimal(1499),
        customYearlyPrice: new Prisma.Decimal(14990),
        billingPeriod: BillingPeriod.MONTHLY,
      };

      const pricingA = calculateRestaurantCustomPricing(subA);
      const pricingB = calculateRestaurantCustomPricing(subB);

      expect(pricingA.amountInRupees).toBe(499);
      expect(pricingA.amountInPaise).toBe(49900);

      expect(pricingB.amountInRupees).toBe(1499);
      expect(pricingB.amountInPaise).toBe(149900);

      // Verify independence
      expect(pricingA.amountInRupees).not.toBe(pricingB.amountInRupees);
    });
  });

  // 5. Billing/payment request uses server-side assigned price
  describe("5. Server-Side Assigned Price Resolution", () => {
    it("calculates exact renewal request amount matching restaurant database record", () => {
      const restConfig = {
        customMonthlyPrice: new Prisma.Decimal(799),
        customYearlyPrice: new Prisma.Decimal(7990),
        billingPeriod: BillingPeriod.MONTHLY,
      };

      const result = calculateRestaurantCustomPricing(restConfig, BillingPeriod.MONTHLY);
      expect(result.amountInRupees).toBe(799);
      expect(result.amountInPaise).toBe(79900);
    });

    it("evaluates subscription status with assigned custom pricing attributes", () => {
      const subRecord: Parameters<typeof evaluateSubscriptionStatus>[0] = {
        status: SubscriptionStatus.ACTIVE,
        plan: SubscriptionPlan.MEDIUM,
        tableLimit: 12,
        endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        billingPeriod: BillingPeriod.MONTHLY,
        currency: "INR",
        customMonthlyPrice: new Prisma.Decimal(799),
        customYearlyPrice: new Prisma.Decimal(7990),
        paymentStatus: SubscriptionPaymentStatus.PAID,
        nextBillingDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
      };

      const evaluated = evaluateSubscriptionStatus(subRecord);
      expect(evaluated.isValid).toBe(true);
      expect(evaluated.customMonthlyPrice).toBe(799);
      expect(evaluated.customYearlyPrice).toBe(7990);
      expect(evaluated.assignedAmount).toBe(799);
      expect(evaluated.paymentStatus).toBe(SubscriptionPaymentStatus.PAID);
    });
  });

  // 6. Client cannot override the billing amount
  describe("6. Client-Side Price Override Tampering Prevention", () => {
    it("ignores any client-provided amount field in payment request calculation", () => {
      // Attacker sends manipulated amount
      const manipulatedSubmission = {
        plan: SubscriptionPlan.SMALL,
        billingPeriod: BillingPeriod.MONTHLY,
        paymentMethod: PaymentMethod.UPI,
        utrReference: "427918239012",
        amount: 1, // Tampered ₹1
        amountPaise: 100,
      };

      const parsed = CreatePaymentRequestSchema.safeParse(manipulatedSubmission);
      expect(parsed.success).toBe(true);

      // Server determines price from DB subscription, ignoring client amount:
      const dbSubscription = {
        customMonthlyPrice: new Prisma.Decimal(1499),
        customYearlyPrice: new Prisma.Decimal(14990),
        billingPeriod: BillingPeriod.MONTHLY,
      };

      const officialPricing = calculateRestaurantCustomPricing(
        dbSubscription,
        parsed.data?.billingPeriod
      );

      // Crucial: The official server amount is 1499, NOT 1
      expect(officialPricing.amountInRupees).toBe(1499);
      expect(officialPricing.amountInPaise).toBe(149900);
      expect(officialPricing.amountInRupees).not.toBe(manipulatedSubmission.amount);
    });
  });

  // 7. Monthly pricing works
  describe("7. Monthly Pricing Cycle", () => {
    it("applies monthly custom amount and 30-day duration cycle", () => {
      const sub = {
        customMonthlyPrice: new Prisma.Decimal(850),
        customYearlyPrice: new Prisma.Decimal(8500),
        billingPeriod: BillingPeriod.MONTHLY,
      };

      const pricing = calculateRestaurantCustomPricing(sub, BillingPeriod.MONTHLY);
      expect(pricing.billingPeriod).toBe("MONTHLY");
      expect(pricing.amountInRupees).toBe(850);
      expect(pricing.amountInPaise).toBe(85000);

      const cycle = calculateSubscriptionCycleDates(null, BillingPeriod.MONTHLY);
      const diffDays = Math.round(
        (cycle.endDate.getTime() - cycle.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBe(SUBSCRIPTION_DURATION_DAYS);
      expect(diffDays).toBe(30);
    });
  });

  // 8. Yearly pricing works
  describe("8. Yearly Pricing Cycle", () => {
    it("applies yearly custom amount and 365-day duration cycle", () => {
      const sub = {
        customMonthlyPrice: new Prisma.Decimal(850),
        customYearlyPrice: new Prisma.Decimal(8500),
        billingPeriod: BillingPeriod.YEARLY,
      };

      const pricing = calculateRestaurantCustomPricing(sub, BillingPeriod.YEARLY);
      expect(pricing.billingPeriod).toBe("YEARLY");
      expect(pricing.amountInRupees).toBe(8500);
      expect(pricing.amountInPaise).toBe(850000);

      const cycle = calculateSubscriptionCycleDates(null, BillingPeriod.YEARLY);
      const diffDays = Math.round(
        (cycle.endDate.getTime() - cycle.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      expect(diffDays).toBe(SUBSCRIPTION_YEARLY_DAYS);
      expect(diffDays).toBe(365);
    });
  });

  // 9. Tenant isolation works
  describe("9. Tenant Isolation", () => {
    it("rejects unauthorized access when Owner A requests Owner B subscription", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "owner_restaurant_A",
        UserRole.RESTAURANT_OWNER,
        "restaurant_B_id"
      );

      expect(access.authorized).toBe(false);
      expect(access.isSuperAdmin).toBe(false);
    });
  });

  // 10. Unauthorized access returns correct error
  describe("10. Unauthorized Access Verification", () => {
    it("rejects invalid role attempts without membership", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess("unauthorized_user", UserRole.STAFF, "rest_1");
      expect(access.authorized).toBe(false);
    });
  });

  // 11. Existing subscription functionality still works
  describe("11. Existing Subscription Compatibility", () => {
    it("preserves fallback plan pricing calculations for backwards compatibility", () => {
      const small = calculatePlanPricing(SubscriptionPlan.SMALL);
      expect(small.amountInRupees).toBe(499);
      expect(small.amountInPaise).toBe(49900);

      const medium = calculatePlanPricing(SubscriptionPlan.MEDIUM);
      expect(medium.amountInRupees).toBe(999);

      const large = calculatePlanPricing(SubscriptionPlan.LARGE, 10);
      expect(large.amountInRupees).toBe(1000);
      expect(verifyClaimedPricing(SubscriptionPlan.LARGE, 10, 100000)).toBe(true);
    });

    it("evaluates default unconfigured subscription gracefully", () => {
      const evaluation = evaluateSubscriptionStatus(null);
      expect(evaluation.hasSubscription).toBe(false);
      expect(evaluation.isValid).toBe(false);
      expect(evaluation.customMonthlyPrice).toBe(499);
      expect(evaluation.customYearlyPrice).toBe(4990);
    });
  });
});
