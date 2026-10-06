import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import {
  CreatePaymentRequestSchema,
  ReviewPaymentRequestSchema,
  AdminManageSubscriptionSchema,
} from "@/lib/validations/subscription";
import { prisma } from "@/lib/db/prisma";
import { UserRole, MembershipRole, SubscriptionPlan, PaymentMethod, PaymentRequestStatus } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

describe("Subscription Security & Multi-Tenancy Controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Tenant Isolation on Subscriptions", () => {
    it("denies access when an owner attempts to access another restaurant subscription (IDOR defense)", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "attacker_owner_id",
        UserRole.RESTAURANT_OWNER,
        "victim_restaurant_id"
      );

      expect(access.authorized).toBe(false);
      expect(access.isSuperAdmin).toBe(false);
    });

    it("permits verified owner to access their own restaurant subscription", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_1",
        userId: "owner_1",
        restaurantId: "rest_1",
        role: MembershipRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess(
        "owner_1",
        UserRole.RESTAURANT_OWNER,
        "rest_1"
      );

      expect(access.authorized).toBe(true);
      expect(access.membershipRole).toBe(MembershipRole.OWNER);
    });
  });

  describe("Payment Submission Input Validation", () => {
    it("accepts valid UPI submission with proper UTR number", () => {
      const valid = CreatePaymentRequestSchema.safeParse({
        plan: SubscriptionPlan.SMALL,
        paymentMethod: PaymentMethod.UPI,
        utrReference: "427918239012",
        proofUrl: "https://example.com/receipt.png",
        notes: "Paid from HDFC UPI",
      });

      expect(valid.success).toBe(true);
    });

    it("rejects invalid or too short UTR reference", () => {
      const invalid = CreatePaymentRequestSchema.safeParse({
        plan: SubscriptionPlan.SMALL,
        paymentMethod: PaymentMethod.UPI,
        utrReference: "123", // Too short (min 6 required)
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.utrReference).toBeDefined();
      }
    });

    it("rejects Large plan without specifying required tableCount", () => {
      const invalid = CreatePaymentRequestSchema.safeParse({
        plan: SubscriptionPlan.LARGE,
        paymentMethod: PaymentMethod.BANK_TRANSFER,
        utrReference: "IMPS8921829102",
        // Missing tableCount
      });

      expect(invalid.success).toBe(false);
      if (!invalid.success) {
        expect(invalid.error.flatten().fieldErrors.tableCount).toBeDefined();
      }
    });

    it("rejects suspicious characters in UTR reference", () => {
      const invalid = CreatePaymentRequestSchema.safeParse({
        plan: SubscriptionPlan.MEDIUM,
        paymentMethod: PaymentMethod.UPI,
        utrReference: "UTR<script>alert(1)</script>",
      });

      expect(invalid.success).toBe(false);
    });
  });

  describe("Payment Review Schema & Status Transitions", () => {
    it("allows valid approval review", () => {
      const valid = ReviewPaymentRequestSchema.safeParse({
        status: PaymentRequestStatus.APPROVED,
        adminNotes: "UTR confirmed in ICICI statement",
      });
      expect(valid.success).toBe(true);
    });

    it("allows valid rejection review with reason", () => {
      const valid = ReviewPaymentRequestSchema.safeParse({
        status: PaymentRequestStatus.REJECTED,
        adminNotes: "UTR not found in bank records.",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects invalid review status", () => {
      const invalid = ReviewPaymentRequestSchema.safeParse({
        status: "PENDING", // Cannot transition to PENDING
      });
      expect(validOrInvalid(invalid)).toBe(false);
    });
  });

  describe("Admin Manage Subscription Schema (Activate, Suspend, Extend)", () => {
    it("accepts valid ACTIVATE action with optional days and mandatory audit reason", () => {
      const valid = AdminManageSubscriptionSchema.safeParse({
        action: "ACTIVATE",
        days: 30,
        reason: "Reactivated following payment dispute resolution.",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts valid SUSPEND action with mandatory audit reason", () => {
      const valid = AdminManageSubscriptionSchema.safeParse({
        action: "SUSPEND",
        reason: "Suspended due to chargeback request.",
      });
      expect(valid.success).toBe(true);
    });

    it("accepts valid EXTEND action with days and reason", () => {
      const valid = AdminManageSubscriptionSchema.safeParse({
        action: "EXTEND",
        days: 15,
        reason: "Promotional festival courtesy extension.",
      });
      expect(valid.success).toBe(true);
    });

    it("rejects action if reason is missing or too short", () => {
      const invalid = AdminManageSubscriptionSchema.safeParse({
        action: "ACTIVATE",
        days: 30,
        reason: "ok", // Too short (min 3 chars required)
      });
      expect(invalid.success).toBe(false);
    });
  });
});

function validOrInvalid(res: { success: boolean }) {
  return res.success;
}
