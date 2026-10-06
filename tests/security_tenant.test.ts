import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import {
  canPubliclyAccessRestaurant,
  evaluateRestaurantGovernance,
} from "@/lib/security/governance";
import { verifyRestaurantAccess, requireSuperAdmin, requireAuth } from "@/lib/security/tenant";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus, MembershipRole, UserRole } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

describe("Multi-Tenant & Restaurant Governance Rules", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("canPubliclyAccessRestaurant", () => {
    it("allows access when APPROVED, ACTIVE, and NOT SUSPENDED", () => {
      const result = canPubliclyAccessRestaurant({
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        isSuspended: false,
      });
      expect(result).toBe(true);
    });

    it("denies access if restaurant is PENDING approval, even if active", () => {
      const result = canPubliclyAccessRestaurant({
        approvalStatus: ApprovalStatus.PENDING,
        isActive: true,
        isSuspended: false,
      });
      expect(result).toBe(false);
    });

    it("denies access if restaurant is REJECTED", () => {
      const result = canPubliclyAccessRestaurant({
        approvalStatus: ApprovalStatus.REJECTED,
        isActive: true,
        isSuspended: false,
      });
      expect(result).toBe(false);
    });

    it("denies access if restaurant is APPROVED but INACTIVE (owner closed)", () => {
      const result = canPubliclyAccessRestaurant({
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: false,
        isSuspended: false,
      });
      expect(result).toBe(false);
    });

    it("denies access if restaurant is APPROVED and ACTIVE but SUSPENDED by Super Admin", () => {
      const result = canPubliclyAccessRestaurant({
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: true,
        isSuspended: true,
      });
      expect(result).toBe(false);
    });
  });

  describe("evaluateRestaurantGovernance", () => {
    it("reports separate controls for approval and activation", () => {
      const status = evaluateRestaurantGovernance({
        approvalStatus: ApprovalStatus.PENDING,
        isActive: false,
        isSuspended: false,
      });

      expect(status.isPending).toBe(true);
      expect(status.isApproved).toBe(false);
      expect(status.isActive).toBe(false);
      expect(status.isSuspended).toBe(false);
      expect(status.canAcceptOrders).toBe(false);
    });

    it("correctly identifies approved but inactive restaurant", () => {
      const status = evaluateRestaurantGovernance({
        approvalStatus: ApprovalStatus.APPROVED,
        isActive: false,
        isSuspended: false,
      });

      expect(status.isApproved).toBe(true);
      expect(status.isActive).toBe(false);
      expect(status.canAcceptOrders).toBe(false);
    });
  });

  describe("verifyRestaurantAccess (Tenant Isolation)", () => {
    it("grants access to Super Admin without requiring specific restaurant membership", async () => {
      const result = await verifyRestaurantAccess(
        "admin_user_id",
        UserRole.SUPER_ADMIN,
        "any_restaurant_id"
      );

      expect(result.authorized).toBe(true);
      expect(result.isSuperAdmin).toBe(true);
      expect(prisma.restaurantMember.findUnique).not.toHaveBeenCalled();
    });

    it("grants access to verified restaurant owner", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_1",
        userId: "owner_123",
        restaurantId: "rest_abc",
        role: MembershipRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await verifyRestaurantAccess(
        "owner_123",
        UserRole.RESTAURANT_OWNER,
        "rest_abc"
      );

      expect(result.authorized).toBe(true);
      expect(result.membershipRole).toBe(MembershipRole.OWNER);
      expect(result.isSuperAdmin).toBe(false);
      expect(prisma.restaurantMember.findUnique).toHaveBeenCalledWith({
        where: {
          userId_restaurantId: {
            userId: "owner_123",
            restaurantId: "rest_abc",
          },
        },
      });
    });

    it("denies access when an owner attempts to access another restaurant id (IDOR defense)", async () => {
      // Mock returns null because user does not have membership in target restaurant
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const result = await verifyRestaurantAccess(
        "attacker_owner_id",
        UserRole.RESTAURANT_OWNER,
        "victim_restaurant_id"
      );

      expect(result.authorized).toBe(false);
      expect(result.isSuperAdmin).toBe(false);
    });

    it("denies access if user has membership but role does not satisfy allowed roles", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_2",
        userId: "staff_123",
        restaurantId: "rest_abc",
        role: MembershipRole.STAFF,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await verifyRestaurantAccess(
        "staff_123",
        UserRole.STAFF,
        "rest_abc",
        [MembershipRole.OWNER] // Only OWNER allowed
      );

      expect(result.authorized).toBe(false);
      expect(result.membershipRole).toBe(MembershipRole.STAFF);
    });
  });

  describe("requireSuperAdmin (Super Admin Panel Authorization Guard)", () => {
    const originalSuperAdminEmail = process.env.SUPER_ADMIN_EMAIL;
    const originalDesignatedEmail = process.env.DESIGNATED_SUPER_ADMIN_EMAIL;

    beforeEach(() => {
      delete process.env.SUPER_ADMIN_EMAIL;
      delete process.env.DESIGNATED_SUPER_ADMIN_EMAIL;
    });

    afterAll(() => {
      if (originalSuperAdminEmail !== undefined) {
        process.env.SUPER_ADMIN_EMAIL = originalSuperAdminEmail;
      } else {
        delete process.env.SUPER_ADMIN_EMAIL;
      }
      if (originalDesignatedEmail !== undefined) {
        process.env.DESIGNATED_SUPER_ADMIN_EMAIL = originalDesignatedEmail;
      } else {
        delete process.env.DESIGNATED_SUPER_ADMIN_EMAIL;
      }
    });

    it("allows access when authenticated user has role SUPER_ADMIN in DB and session", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "admin_1",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "admin_1",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const user = await requireSuperAdmin();
      expect(user.role).toBe(UserRole.SUPER_ADMIN);
      expect(user.email).toBe("admin@qrserve.com");
    });

    it("throws 403 AuthorizationError when a restaurant owner attempts to access Super Admin panel", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "owner_1",
        email: "owner@restaurant.com",
        name: "Restaurant Owner",
        role: UserRole.RESTAURANT_OWNER,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "owner_1",
        email: "owner@restaurant.com",
        name: "Restaurant Owner",
        role: UserRole.RESTAURANT_OWNER,
        isActive: true,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(requireSuperAdmin()).rejects.toThrow("Super Admin privileges required.");
    });

    it("throws 401 AuthenticationError when unauthenticated user attempts to access Super Admin panel", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce(null);

      await expect(requireSuperAdmin()).rejects.toThrow("You must be logged in to access this resource.");
    });

    it("throws 401 AuthenticationError when user account is deactivated in database", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "admin_1",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "admin_1",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
        isActive: false, // Deactivated!
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(requireSuperAdmin()).rejects.toThrow("Account is inactive or does not exist.");
    });

    it("prevents privilege escalation: rejects if token claims SUPER_ADMIN but DB says RESTAURANT_OWNER", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "tampered_user",
        email: "attacker@restaurant.com",
        name: "Attacker",
        role: UserRole.SUPER_ADMIN, // Stale or tampered token claims SUPER_ADMIN
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "tampered_user",
        email: "attacker@restaurant.com",
        name: "Attacker",
        role: UserRole.RESTAURANT_OWNER, // Database says owner!
        isActive: true,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      await expect(requireSuperAdmin()).rejects.toThrow("Super Admin privileges required.");
    });

    it("enforces designated Super Admin email when environment variable is configured", async () => {
      const originalEnv = process.env.SUPER_ADMIN_EMAIL;
      try {
        process.env.SUPER_ADMIN_EMAIL = "designated-admin@gmail.com";

        // Scenario A: Non-designated admin account (even if SUPER_ADMIN in DB) is rejected
        vi.mocked(getSessionUser).mockResolvedValueOnce({
          id: "other_admin",
          email: "otheradmin@gmail.com",
          name: "Other Admin",
          role: UserRole.SUPER_ADMIN,
        });

        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
          id: "other_admin",
          email: "otheradmin@gmail.com",
          name: "Other Admin",
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

        await expect(requireSuperAdmin()).rejects.toThrow("Access denied: Account is not the designated Super Admin.");

        // Scenario B: Designated admin account succeeds
        vi.mocked(getSessionUser).mockResolvedValueOnce({
          id: "desig_1",
          email: "designated-admin@gmail.com",
          name: "Designated Admin",
          role: UserRole.SUPER_ADMIN,
        });

        vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
          id: "desig_1",
          email: "designated-admin@gmail.com",
          name: "Designated Admin",
          role: UserRole.SUPER_ADMIN,
          isActive: true,
        } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

        const result = await requireSuperAdmin();
        expect(result.email).toBe("designated-admin@gmail.com");
        expect(result.role).toBe(UserRole.SUPER_ADMIN);
      } finally {
        process.env.SUPER_ADMIN_EMAIL = originalEnv;
      }
    });
  });

  describe("requireAuth (Authentication Session Guard)", () => {
    it("returns user session when authenticated", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "owner_1",
        email: "owner@restaurant.com",
        name: "Restaurant Owner",
        role: UserRole.RESTAURANT_OWNER,
      });

      const user = await requireAuth();
      expect(user.id).toBe("owner_1");
    });

    it("throws 401 AuthenticationError when session is missing", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce(null);

      await expect(requireAuth()).rejects.toThrow("You must be logged in to access this resource.");
    });
  });
});
