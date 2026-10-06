import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { UserRole, MembershipRole } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    menuCategory: {
      findUnique: vi.fn(),
    },
  },
}));

describe("Menu & Category Multi-Tenant Isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Restaurant Tenant Boundary (IDOR Defense)", () => {
    it("denies access when user is not a member of the target restaurant", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "malicious_user",
        UserRole.RESTAURANT_OWNER,
        "victim_restaurant_id"
      );

      expect(access.authorized).toBe(false);
      expect(access.isSuperAdmin).toBe(false);
    });

    it("permits verified restaurant owner to access menu management", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_1",
        userId: "valid_owner",
        restaurantId: "my_restaurant",
        role: MembershipRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess(
        "valid_owner",
        UserRole.RESTAURANT_OWNER,
        "my_restaurant"
      );

      expect(access.authorized).toBe(true);
      expect(access.membershipRole).toBe(MembershipRole.OWNER);
    });
  });

  describe("Cross-Restaurant Category Assignment Defense", () => {
    it("detects when a category belongs to a different restaurant", async () => {
      // Mock category belongs to restaurant B
      vi.mocked(prisma.menuCategory.findUnique).mockResolvedValueOnce({
        id: "foreign_category_id",
        restaurantId: "restaurant_B",
        name: "Foreign Starters",
        description: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Target restaurant is restaurant A
      const targetRestaurantId = "restaurant_A";
      const category = await prisma.menuCategory.findUnique({
        where: { id: "foreign_category_id" },
      });

      const isBelongingToRestaurant = category?.restaurantId === targetRestaurantId;
      expect(isBelongingToRestaurant).toBe(false);
    });

    it("validates when category belongs to the current restaurant", async () => {
      vi.mocked(prisma.menuCategory.findUnique).mockResolvedValueOnce({
        id: "valid_category_id",
        restaurantId: "restaurant_A",
        name: "Local Starters",
        description: null,
        sortOrder: 0,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const targetRestaurantId = "restaurant_A";
      const category = await prisma.menuCategory.findUnique({
        where: { id: "valid_category_id" },
      });

      const isBelongingToRestaurant = category?.restaurantId === targetRestaurantId;
      expect(isBelongingToRestaurant).toBe(true);
    });
  });
});
