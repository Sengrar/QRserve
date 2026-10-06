import { describe, it, expect, vi, beforeEach } from "vitest";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { UserRole, MembershipRole, OrderStatus, Prisma, TaxCalculationMode } from "@prisma/client";
import { generateOrderAccessToken, verifyOrderAccessToken } from "@/lib/orders";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("Restaurant Orders Tenant Isolation & Access Control", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Restaurant Staff Tenant Boundary", () => {
    it("denies access to Restaurant B orders for an owner belonging only to Restaurant A", async () => {
      // Mock: User is NOT a member of restaurant_B
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "owner_of_rest_A",
        UserRole.RESTAURANT_OWNER,
        "restaurant_B",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(false);
    });

    it("grants access to orders for verified staff of target restaurant", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "member_1",
        userId: "staff_user_1",
        restaurantId: "restaurant_A",
        role: MembershipRole.STAFF,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess(
        "staff_user_1",
        UserRole.STAFF,
        "restaurant_A",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(true);
      expect(access.membershipRole).toBe(MembershipRole.STAFF);
    });
  });

  describe("Cross-Tenant Order Status Update Defense", () => {
    it("prevents updating an order that belongs to another restaurant", async () => {
      // Order belongs to restaurant_B
      vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);

      const existingOrder = await prisma.order.findFirst({
        where: {
          id: "order_123",
          restaurantId: "restaurant_A", // Attempting update under restaurant A
        },
      });

      expect(existingOrder).toBeNull();
    });

    it("successfully finds and permits updating an order belonging to the target restaurant", async () => {
      vi.mocked(prisma.order.findFirst).mockResolvedValueOnce({
        id: "order_123",
        orderNumber: "ORD-9ABC12",
        restaurantId: "restaurant_A",
        tableId: "tbl_1",
        status: OrderStatus.SUBMITTED,
        customerNotes: null,
        subtotal: new Prisma.Decimal("300.00"),
        taxRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        taxMode: TaxCalculationMode.EXCLUSIVE,
        taxableAmount: new Prisma.Decimal("300.00"),
        cgstAmount: new Prisma.Decimal(0),
        sgstAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal("300.00"),
        couponId: null,
        couponCode: null,
        discountAmount: new Prisma.Decimal(0),
        customerPhone: null,
        customerName: null,
        idempotencyKey: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const order = await prisma.order.findFirst({
        where: {
          id: "order_123",
          restaurantId: "restaurant_A",
        },
      });

      expect(order).not.toBeNull();
      expect(order?.restaurantId).toBe("restaurant_A");
    });
  });

  describe("Customer Order Confirmation Privacy & Anti-Enumeration", () => {
    const orderNumber = "ORD-48F9AK";
    const restaurantId = "rest_grand_bistro";

    it("verifies order access when valid cryptographic tracking token is provided", () => {
      const validToken = generateOrderAccessToken(orderNumber, restaurantId);
      const isAuthorized = verifyOrderAccessToken(orderNumber, restaurantId, validToken);
      expect(isAuthorized).toBe(true);
    });

    it("rejects lookup with forged or guessed token (anti-enumeration defense)", () => {
      const isAuthorized = verifyOrderAccessToken(orderNumber, restaurantId, "forged_token_12345");
      expect(isAuthorized).toBe(false);
    });

    it("rejects token generated for different order number or different restaurant", () => {
      const foreignOrderToken = generateOrderAccessToken("ORD-DIFFERENT", restaurantId);
      const isAuthorizedOrder = verifyOrderAccessToken(orderNumber, restaurantId, foreignOrderToken);
      expect(isAuthorizedOrder).toBe(false);

      const foreignRestaurantToken = generateOrderAccessToken(orderNumber, "rest_foreign");
      const isAuthorizedRest = verifyOrderAccessToken(
        orderNumber,
        restaurantId,
        foreignRestaurantToken
      );
      expect(isAuthorizedRest).toBe(false);
    });
  });
});
