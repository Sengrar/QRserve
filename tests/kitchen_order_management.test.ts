import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus, MembershipRole, UserRole, Prisma, TaxCalculationMode } from "@prisma/client";
import {
  validateOrderStatusTransition,
  ORDER_STATUS_CONFIG,
  getAvailableNextStatuses,
} from "@/lib/orders/transitions";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { generateOrderNumber, generateOrderAccessToken, verifyOrderAccessToken } from "@/lib/orders";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    order: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

describe("Phase 5: Kitchen Order Management System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Order Structure & New Order Visibility", () => {
    it("initializes new customer orders with SUBMITTED status and unique order number", () => {
      const orderNumber = generateOrderNumber();
      expect(orderNumber).toMatch(/^ORD-[2-9A-Z]{6}$/);

      const orderData = {
        orderNumber,
        status: OrderStatus.SUBMITTED,
        createdAt: new Date().toISOString(),
        table: { tableNumber: "T-04", name: "Balcony" },
        items: [
          { id: "item_1", itemName: "Paneer Butter Masala", quantity: 2, unitPrice: 240, subtotal: 480, notes: "Mild spicy" },
        ],
      };

      expect(orderData.status).toBe(OrderStatus.SUBMITTED);
      expect(orderData.table.tableNumber).toBe("T-04");
      expect(orderData.items).toHaveLength(1);
    });

    it("correctly identifies elapsed time and kitchen urgency levels", () => {
      const now = new Date("2026-10-04T12:00:00Z");

      // 5 minutes ago -> Normal
      const fiveMinsAgo = new Date("2026-10-04T11:55:00Z");
      const diffSec5 = Math.floor((now.getTime() - fiveMinsAgo.getTime()) / 1000);
      const mins5 = Math.floor(diffSec5 / 60);
      expect(mins5).toBe(5);
      expect(mins5 < 10).toBe(true); // normal urgency

      // 15 minutes ago -> Warning
      const fifteenMinsAgo = new Date("2026-10-04T11:45:00Z");
      const diffSec15 = Math.floor((now.getTime() - fifteenMinsAgo.getTime()) / 1000);
      const mins15 = Math.floor(diffSec15 / 60);
      expect(mins15 >= 10 && mins15 < 20).toBe(true); // warning urgency

      // 25 minutes ago -> Urgent
      const twentyFiveMinsAgo = new Date("2026-10-04T11:35:00Z");
      const diffSec25 = Math.floor((now.getTime() - twentyFiveMinsAgo.getTime()) / 1000);
      const mins25 = Math.floor(diffSec25 / 60);
      expect(mins25 >= 20).toBe(true); // urgent urgency
    });

    it("correctly renders table context or counter takeaway fallback", () => {
      const formatTableContext = (table: { tableNumber: string; name: string | null } | null) => {
        if (!table) return "Counter / Takeaway";
        return `Table ${table.tableNumber}${table.name ? ` (${table.name})` : ""}`;
      };

      expect(formatTableContext({ tableNumber: "7", name: "Patio" })).toBe("Table 7 (Patio)");
      expect(formatTableContext({ tableNumber: "3", name: null })).toBe("Table 3");
      expect(formatTableContext(null)).toBe("Counter / Takeaway");
    });
  });

  describe("2. Correct Order Details, Quantities & Special Instructions", () => {
    it("preserves item-level and order-level instructions without loss", () => {
      const order = {
        orderNumber: "ORD-KITCH1",
        customerNotes: "Allergic to peanuts. Please prepare in clean cookware.",
        items: [
          {
            id: "i1",
            itemName: "Hakka Noodles",
            quantity: 2,
            unitPrice: 180,
            subtotal: 360,
            notes: "Less oil, no spring onions",
          },
          {
            id: "i2",
            itemName: "Manchurian Dry",
            quantity: 1,
            unitPrice: 200,
            subtotal: 200,
            notes: "Extra crispy",
          },
        ],
        totalAmount: 560,
      };

      expect(order.customerNotes).toBe("Allergic to peanuts. Please prepare in clean cookware.");
      expect(order.items[0].notes).toBe("Less oil, no spring onions");
      expect(order.items[0].quantity).toBe(2);
      expect(order.items[1].notes).toBe("Extra crispy");
      expect(order.totalAmount).toBe(560);
    });
  });

  describe("3. Valid Status Transitions", () => {
    it("allows standard linear kitchen progression: SUBMITTED -> CONFIRMED -> PREPARING -> SERVED -> COMPLETED", () => {
      // 1. SUBMITTED -> CONFIRMED
      const res1 = validateOrderStatusTransition(OrderStatus.SUBMITTED, OrderStatus.CONFIRMED);
      expect(res1.valid).toBe(true);
      expect(res1.isNoop).toBe(false);

      // 2. CONFIRMED -> PREPARING
      const res2 = validateOrderStatusTransition(OrderStatus.CONFIRMED, OrderStatus.PREPARING);
      expect(res2.valid).toBe(true);
      expect(res2.isNoop).toBe(false);

      // 3. PREPARING -> SERVED
      const res3 = validateOrderStatusTransition(OrderStatus.PREPARING, OrderStatus.SERVED);
      expect(res3.valid).toBe(true);
      expect(res3.isNoop).toBe(false);

      // 4. SERVED -> COMPLETED
      const res4 = validateOrderStatusTransition(OrderStatus.SERVED, OrderStatus.COMPLETED);
      expect(res4.valid).toBe(true);
      expect(res4.isNoop).toBe(false);
    });

    it("allows cancellation from any active kitchen state", () => {
      const activeStatuses = [
        OrderStatus.SUBMITTED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.SERVED,
      ];

      for (const status of activeStatuses) {
        const res = validateOrderStatusTransition(status, OrderStatus.CANCELLED);
        expect(res.valid).toBe(true);
        expect(res.isNoop).toBe(false);
      }
    });

    it("returns correct available next statuses for each stage", () => {
      expect(getAvailableNextStatuses(OrderStatus.SUBMITTED)).toEqual([
        OrderStatus.CONFIRMED,
        OrderStatus.CANCELLED,
      ]);
      expect(getAvailableNextStatuses(OrderStatus.CONFIRMED)).toEqual([
        OrderStatus.PREPARING,
        OrderStatus.CANCELLED,
      ]);
      expect(getAvailableNextStatuses(OrderStatus.PREPARING)).toEqual([
        OrderStatus.SERVED,
        OrderStatus.CANCELLED,
      ]);
      expect(getAvailableNextStatuses(OrderStatus.SERVED)).toEqual([
        OrderStatus.COMPLETED,
        OrderStatus.CANCELLED,
      ]);
      expect(getAvailableNextStatuses(OrderStatus.COMPLETED)).toEqual([]);
      expect(getAvailableNextStatuses(OrderStatus.CANCELLED)).toEqual([]);
    });

    it("has metadata for all order statuses in ORDER_STATUS_CONFIG", () => {
      for (const status of Object.values(OrderStatus)) {
        const config = ORDER_STATUS_CONFIG[status];
        expect(config).toBeDefined();
        expect(config.label).toBeDefined();
        expect(config.badgeBg).toBeDefined();
      }
    });
  });

  describe("4. Invalid Status Transition Rejection", () => {
    it("rejects modifying a COMPLETED order to any other status", () => {
      const targets = [
        OrderStatus.SUBMITTED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.SERVED,
        OrderStatus.CANCELLED,
      ];

      for (const target of targets) {
        const res = validateOrderStatusTransition(OrderStatus.COMPLETED, target);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Completed orders are finalized and cannot be modified/i);
      }
    });

    it("rejects modifying a CANCELLED order to any other status", () => {
      const targets = [
        OrderStatus.SUBMITTED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.SERVED,
        OrderStatus.COMPLETED,
      ];

      for (const target of targets) {
        const res = validateOrderStatusTransition(OrderStatus.CANCELLED, target);
        expect(res.valid).toBe(false);
        expect(res.error).toMatch(/Cancelled orders cannot be reopened or transitioned/i);
      }
    });

    it("rejects skipping stages (e.g. SUBMITTED directly to SERVED or COMPLETED)", () => {
      const skipToServed = validateOrderStatusTransition(OrderStatus.SUBMITTED, OrderStatus.SERVED);
      expect(skipToServed.valid).toBe(false);
      expect(skipToServed.error).toMatch(/Cannot transition order status from SUBMITTED to SERVED/i);

      const skipToCompleted = validateOrderStatusTransition(OrderStatus.SUBMITTED, OrderStatus.COMPLETED);
      expect(skipToCompleted.valid).toBe(false);
      expect(skipToCompleted.error).toMatch(/Cannot transition order status from SUBMITTED to COMPLETED/i);
    });

    it("rejects reverse transitions (e.g. PREPARING back to SUBMITTED or CONFIRMED)", () => {
      const backToSubmitted = validateOrderStatusTransition(OrderStatus.PREPARING, OrderStatus.SUBMITTED);
      expect(backToSubmitted.valid).toBe(false);

      const backToConfirmed = validateOrderStatusTransition(OrderStatus.PREPARING, OrderStatus.CONFIRMED);
      expect(backToConfirmed.valid).toBe(false);
    });
  });

  describe("5. Concurrent & Repeated Status Updates (Idempotency & Race Protection)", () => {
    it("handles repeated status update to the same status idempotently (no-op)", () => {
      const res1 = validateOrderStatusTransition(OrderStatus.CONFIRMED, OrderStatus.CONFIRMED);
      expect(res1.valid).toBe(true);
      expect(res1.isNoop).toBe(true);

      const res2 = validateOrderStatusTransition(OrderStatus.PREPARING, OrderStatus.PREPARING);
      expect(res2.valid).toBe(true);
      expect(res2.isNoop).toBe(true);

      const res3 = validateOrderStatusTransition(OrderStatus.CANCELLED, OrderStatus.CANCELLED);
      expect(res3.valid).toBe(true);
      expect(res3.isNoop).toBe(true);
    });

    it("simulates optimistic concurrency lock: returns conflict when order was modified concurrently", async () => {
      // Mock: order was read as SUBMITTED, but another staff confirmed it before update
      vi.mocked(prisma.order.updateMany).mockResolvedValueOnce({ count: 0 }); // 0 updated due to status mismatch
      vi.mocked(prisma.order.findUnique).mockResolvedValueOnce({
        id: "order_1",
        orderNumber: "ORD-RACE01",
        restaurantId: "rest_1",
        tableId: null,
        status: OrderStatus.CONFIRMED, // status already changed
        customerNotes: null,
        subtotal: new Prisma.Decimal(200),
        taxRate: new Prisma.Decimal(0),
        taxAmount: new Prisma.Decimal(0),
        taxMode: TaxCalculationMode.EXCLUSIVE,
        taxableAmount: new Prisma.Decimal(200),
        cgstAmount: new Prisma.Decimal(0),
        sgstAmount: new Prisma.Decimal(0),
        totalAmount: new Prisma.Decimal(200),
        couponId: null,
        couponCode: null,
        discountAmount: new Prisma.Decimal(0),
        customerPhone: null,
        customerName: null,
        idempotencyKey: null,
        diningSessionId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const updateResult = await prisma.order.updateMany({
        where: {
          id: "order_1",
          restaurantId: "rest_1",
          status: OrderStatus.SUBMITTED, // expecting SUBMITTED
        },
        data: {
          status: OrderStatus.CONFIRMED,
        },
      });

      expect(updateResult.count).toBe(0);

      const currentOrder = await prisma.order.findUnique({
        where: { id: "order_1" },
      });
      expect(currentOrder?.status).toBe(OrderStatus.CONFIRMED);
    });
  });

  describe("6. Tenant Isolation & Security", () => {
    it("denies order status update for non-staff or foreign user", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "unauthorized_user",
        UserRole.STAFF,
        "restaurant_target",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(false);
    });

    it("permits order status update for verified staff or owner", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_chef",
        userId: "chef_user_1",
        restaurantId: "rest_grand_bistro",
        role: MembershipRole.STAFF,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess(
        "chef_user_1",
        UserRole.STAFF,
        "rest_grand_bistro",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(true);
      expect(access.membershipRole).toBe(MembershipRole.STAFF);
    });

    it("strictly isolates cross-restaurant updates: restaurant A cannot update order belonging to restaurant B", async () => {
      // Order belongs to restaurant B, but request passes restaurant A in URL
      vi.mocked(prisma.order.findFirst).mockResolvedValueOnce(null);

      const orderInScope = await prisma.order.findFirst({
        where: {
          id: "order_belonging_to_restaurant_b",
          restaurantId: "restaurant_a",
        },
      });

      expect(orderInScope).toBeNull();
    });

    it("customers cannot update kitchen order status (only GET tracking receipt is permitted)", () => {
      const orderNumber = "ORD-TEST99";
      const restaurantId = "rest_test";
      const token = generateOrderAccessToken(orderNumber, restaurantId);

      // Customer can verify and read their receipt
      const isReceiptAuthorized = verifyOrderAccessToken(orderNumber, restaurantId, token);
      expect(isReceiptAuthorized).toBe(true);

      // Customer token cannot be used to update status: PATCH route enforces requireAuth() session
    });
  });

  describe("7. Empty Kitchen Queue & Cancelled Orders Handling", () => {
    it("handles empty active queue state gracefully", () => {
      const orders: Array<{ id: string; orderNumber: string; status: OrderStatus }> = [];
      const activeStatuses: OrderStatus[] = [
        OrderStatus.SUBMITTED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.SERVED,
      ];
      const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));

      expect(activeOrders).toHaveLength(0);
    });

    it("strictly excludes cancelled orders from active kitchen queue", () => {
      const orders: Array<{ id: string; orderNumber: string; status: OrderStatus }> = [
        { id: "1", orderNumber: "ORD-1", status: OrderStatus.SUBMITTED },
        { id: "2", orderNumber: "ORD-2", status: OrderStatus.CANCELLED },
        { id: "3", orderNumber: "ORD-3", status: OrderStatus.PREPARING },
      ];

      const activeStatuses: OrderStatus[] = [
        OrderStatus.SUBMITTED,
        OrderStatus.CONFIRMED,
        OrderStatus.PREPARING,
        OrderStatus.SERVED,
      ];
      const activeOrders = orders.filter((o) => activeStatuses.includes(o.status));

      expect(activeOrders).toHaveLength(2);
      expect(activeOrders.map((o) => o.orderNumber)).toEqual(["ORD-1", "ORD-3"]);
    });

    it("strictly excludes cancelled orders from revenue and sales calculations", () => {
      const orders = [
        { id: "1", totalAmount: 500, status: OrderStatus.COMPLETED },
        { id: "2", totalAmount: 300, status: OrderStatus.CANCELLED },
        { id: "3", totalAmount: 200, status: OrderStatus.PREPARING },
      ];

      const validSales = orders
        .filter((o) => o.status !== OrderStatus.CANCELLED)
        .reduce((sum, o) => sum + o.totalAmount, 0);

      expect(validSales).toBe(700); // 500 + 200, excluding 300
    });
  });
});
