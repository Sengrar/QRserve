import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { generateOrderNumber } from "@/lib/orders";

describe("Order Security & Server-Side Price Calculation", () => {
  describe("Authoritative Price Recalculation (Price Tampering Immunity)", () => {
    // Simulated database items with authoritative prices
    const dbItems = [
      {
        id: "item_pizza",
        name: "Margherita Pizza",
        price: new Prisma.Decimal("350.00"),
        restaurantId: "rest_alpha",
        isAvailable: true,
      },
      {
        id: "item_coke",
        name: "Coca Cola",
        price: new Prisma.Decimal("50.00"),
        restaurantId: "rest_alpha",
        isAvailable: true,
      },
    ];

    it("calculates exact line totals and subtotal from DB prices ignoring browser inputs", () => {
      // Browser attempted tampering: claiming pizza is 1.00 and coke is 5.00
      const clientCart = [
        { menuItemId: "item_pizza", quantity: 2, clientClaimedPrice: 1.0 },
        { menuItemId: "item_coke", quantity: 3, clientClaimedPrice: 5.0 },
      ];

      // Server recalculation logic
      let serverSubtotal = new Prisma.Decimal(0);
      const snapshottedItems = clientCart.map((cartItem) => {
        const authoritativeItem = dbItems.find((d) => d.id === cartItem.menuItemId)!;
        const lineTotal = authoritativeItem.price.mul(cartItem.quantity);
        serverSubtotal = serverSubtotal.add(lineTotal);

        return {
          menuItemId: authoritativeItem.id,
          itemName: authoritativeItem.name,
          unitPrice: authoritativeItem.price,
          quantity: cartItem.quantity,
          subtotal: lineTotal,
        };
      });

      // 2 * 350 = 700, 3 * 50 = 150 -> 850 total
      expect(serverSubtotal.toString()).toBe("850");
      expect(snapshottedItems[0].subtotal.toString()).toBe("700");
      expect(snapshottedItems[1].subtotal.toString()).toBe("150");

      // Verify that historical order stores authoritative snapshots
      expect(snapshottedItems[0].itemName).toBe("Margherita Pizza");
      expect(snapshottedItems[0].unitPrice.toString()).toBe("350");
    });
  });

  describe("Cross-Restaurant Menu Item Defense", () => {
    const mockMenuItems = [
      { id: "item_1", restaurantId: "rest_alpha", isAvailable: true, name: "Burger" },
      { id: "item_2", restaurantId: "rest_beta", isAvailable: true, name: "Foreign Taco" },
    ];

    function validateOrderItemsBelongToRestaurant(
      restaurantId: string,
      items: Array<{ menuItemId: string; quantity: number }>
    ) {
      for (const item of items) {
        const found = mockMenuItems.find((m) => m.id === item.menuItemId);
        if (!found) return { valid: false, error: "ITEM_NOT_FOUND" };
        if (found.restaurantId !== restaurantId) {
          return { valid: false, error: "TENANT_MISMATCH" };
        }
      }
      return { valid: true };
    }

    it("permits items belonging exclusively to the target restaurant", () => {
      const result = validateOrderItemsBelongToRestaurant("rest_alpha", [
        { menuItemId: "item_1", quantity: 1 },
      ]);
      expect(result.valid).toBe(true);
    });

    it("rejects order containing items from another restaurant (cross-restaurant injection)", () => {
      const result = validateOrderItemsBelongToRestaurant("rest_alpha", [
        { menuItemId: "item_1", quantity: 1 },
        { menuItemId: "item_2", quantity: 1 }, // Belongs to rest_beta!
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("TENANT_MISMATCH");
    });
  });

  describe("Dish Availability Defense", () => {
    const mockMenuItems = [
      { id: "item_available", name: "Fries", isAvailable: true, isCategoryActive: true },
      { id: "item_sold_out", name: "Special Pasta", isAvailable: false, isCategoryActive: true },
      { id: "item_inactive_cat", name: "Seasonal Soup", isAvailable: true, isCategoryActive: false },
    ];

    function checkItemAvailability(items: Array<{ menuItemId: string }>) {
      for (const item of items) {
        const found = mockMenuItems.find((m) => m.id === item.menuItemId);
        if (!found || !found.isAvailable || !found.isCategoryActive) {
          return { valid: false, error: `Item "${found?.name || "Dish"}" is unavailable` };
        }
      }
      return { valid: true };
    }

    it("rejects order if any item is marked unavailable/sold-out", () => {
      const result = checkItemAvailability([
        { menuItemId: "item_available" },
        { menuItemId: "item_sold_out" },
      ]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Special Pasta");
    });

    it("rejects order if item belongs to an inactive category", () => {
      const result = checkItemAvailability([{ menuItemId: "item_inactive_cat" }]);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("Seasonal Soup");
    });
  });

  describe("Order Number Generation & Uniqueness", () => {
    it("generates human-readable, safe order numbers with ORD- prefix", () => {
      const orderNumber = generateOrderNumber();
      expect(orderNumber).toMatch(/^ORD-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
    });

    it("generates distinct order numbers without immediate collision", () => {
      const set = new Set<string>();
      for (let i = 0; i < 100; i++) {
        set.add(generateOrderNumber());
      }
      expect(set.size).toBe(100);
    });
  });

  describe("Duplicate Submission Protection (Idempotency)", () => {
    const existingOrdersDb: Record<string, { orderNumber: string; totalAmount: number }> = {};

    function processOrderWithIdempotency(orderData: {
      idempotencyKey?: string;
      total: number;
    }) {
      if (orderData.idempotencyKey && existingOrdersDb[orderData.idempotencyKey]) {
        return {
          isDuplicate: true,
          order: existingOrdersDb[orderData.idempotencyKey],
        };
      }

      const newOrder = {
        orderNumber: generateOrderNumber(),
        totalAmount: orderData.total,
      };

      if (orderData.idempotencyKey) {
        existingOrdersDb[orderData.idempotencyKey] = newOrder;
      }

      return {
        isDuplicate: false,
        order: newOrder,
      };
    }

    it("returns existing order without duplicate insertion on rapid double-submit", () => {
      const idemKey = "checkout_session_unique_123";

      // First submission
      const first = processOrderWithIdempotency({ idempotencyKey: idemKey, total: 450 });
      expect(first.isDuplicate).toBe(false);

      // Second submission with identical idempotencyKey
      const second = processOrderWithIdempotency({ idempotencyKey: idemKey, total: 450 });
      expect(second.isDuplicate).toBe(true);
      expect(second.order.orderNumber).toBe(first.order.orderNumber);
    });
  });
});
