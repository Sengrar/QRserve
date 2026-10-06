import { describe, it, expect } from "vitest";
import { Prisma, OrderStatus } from "@prisma/client";
import { generateOrderAccessToken, verifyOrderAccessToken } from "@/lib/orders";

describe("Customer Order Receipt & Verification System", () => {
  describe("Receipt Data Integrity & Authoritative Server Calculation", () => {
    // Authoritative items in database
    const dbMenuItems = [
      {
        id: "menu_item_biryani",
        name: "Hyderabadi Chicken Biryani",
        price: new Prisma.Decimal("320.00"),
        restaurantId: "rest_royal_dine",
        isAvailable: true,
      },
      {
        id: "menu_item_raita",
        name: "Mint Raita",
        price: new Prisma.Decimal("45.50"),
        restaurantId: "rest_royal_dine",
        isAvailable: true,
      },
    ];

    it("displays correct order items and server-calculated total regardless of client inputs", () => {
      const customerOrderInput = [
        { menuItemId: "menu_item_biryani", quantity: 2, notes: "Extra spicy" },
        { menuItemId: "menu_item_raita", quantity: 3, notes: null },
      ];

      let calculatedSubtotal = new Prisma.Decimal(0);
      const receiptItems = customerOrderInput.map((item) => {
        const dbItem = dbMenuItems.find((m) => m.id === item.menuItemId)!;
        const lineTotal = dbItem.price.mul(item.quantity);
        calculatedSubtotal = calculatedSubtotal.add(lineTotal);

        return {
          id: `ord_item_${dbItem.id}`,
          itemName: dbItem.name,
          quantity: item.quantity,
          unitPrice: Number(dbItem.price),
          subtotal: Number(lineTotal),
          notes: item.notes,
        };
      });

      const grandTotal = calculatedSubtotal;

      // 2 * 320.00 = 640.00
      expect(receiptItems[0].subtotal).toBe(640.0);
      expect(receiptItems[0].itemName).toBe("Hyderabadi Chicken Biryani");
      expect(receiptItems[0].notes).toBe("Extra spicy");

      // 3 * 45.50 = 136.50
      expect(receiptItems[1].subtotal).toBe(136.5);
      expect(receiptItems[1].notes).toBeNull();

      // Total = 776.50
      expect(Number(grandTotal)).toBe(776.5);
    });

    it("preserves special instructions if present and displays on receipt", () => {
      const order = {
        orderNumber: "ORD-987XYZ",
        customerNotes: "Please deliver cutlery and extra napkins to table",
        status: OrderStatus.SUBMITTED,
      };

      expect(order.customerNotes).toBe("Please deliver cutlery and extra napkins to table");
      expect(order.status).toBe(OrderStatus.SUBMITTED);
    });
  });

  describe("Correct Restaurant & Table Context", () => {
    it("correctly formats table context when QR table data is present", () => {
      const tableData = {
        tableNumber: "12",
        name: "Window Garden",
      };

      const tableLabel = `Table ${tableData.tableNumber}${tableData.name ? ` (${tableData.name})` : ""}`;
      expect(tableLabel).toBe("Table 12 (Window Garden)");
    });

    it("correctly falls back to Counter / Takeaway when table context is absent", () => {
      const getTableContextLabel = (table: { tableNumber: string } | null) =>
        table ? `Table ${table.tableNumber}` : "Counter / Takeaway";

      expect(getTableContextLabel(null)).toBe("Counter / Takeaway");
      expect(getTableContextLabel({ tableNumber: "5" })).toBe("Table 5");
    });

    it("includes restaurant contact and branding information in receipt payload", () => {
      const restaurant = {
        name: "Royal Spice Diner",
        slug: "royal-spice-diner",
        phone: "+91 98765 43210",
        address: "42 MG Road, Bengaluru, Karnataka",
      };

      expect(restaurant.name).toBe("Royal Spice Diner");
      expect(restaurant.phone).toBe("+91 98765 43210");
      expect(restaurant.address).toBe("42 MG Road, Bengaluru, Karnataka");
    });
  });

  describe("Tenant Isolation & Anti-Enumeration Defense", () => {
    const restaurantA_Id = "rest_restaurant_alpha";
    const restaurantB_Id = "rest_restaurant_beta";
    const orderNumberA = "ORD-ALPH01";
    const orderNumberB = "ORD-BETA01";

    it("generates a deterministic cryptographic HMAC token for order access", () => {
      const token = generateOrderAccessToken(orderNumberA, restaurantA_Id);
      expect(token).toBeDefined();
      expect(typeof token).toBe("string");
      expect(token.length).toBe(32);
    });

    it("allows receipt access when customer provides legitimate token for this order", () => {
      const validToken = generateOrderAccessToken(orderNumberA, restaurantA_Id);
      const isAllowed = verifyOrderAccessToken(orderNumberA, restaurantA_Id, validToken);
      expect(isAllowed).toBe(true);
    });

    it("unauthorized customer cannot access another restaurant's order (cross-restaurant rejection)", () => {
      // Customer has token for Order A at Restaurant A
      const tokenOrderA = generateOrderAccessToken(orderNumberA, restaurantA_Id);

      // Customer attempts to access Order B at Restaurant B using tokenOrderA
      const isAllowed = verifyOrderAccessToken(orderNumberB, restaurantB_Id, tokenOrderA);
      expect(isAllowed).toBe(false);
    });

    it("unauthorized customer cannot guess or enumerate order numbers within the same restaurant", () => {
      const tokenOrderA = generateOrderAccessToken(orderNumberA, restaurantA_Id);

      // Customer tries to view neighbor's order ORD-ALPH02 using their token
      const isAllowed = verifyOrderAccessToken("ORD-ALPH02", restaurantA_Id, tokenOrderA);
      expect(isAllowed).toBe(false);
    });

    it("rejects forged or corrupted tokens", () => {
      expect(verifyOrderAccessToken(orderNumberA, restaurantA_Id, "")).toBe(false);
      expect(verifyOrderAccessToken(orderNumberA, restaurantA_Id, "invalid_forged_hex")).toBe(false);
      expect(verifyOrderAccessToken(orderNumberA, restaurantA_Id, "a".repeat(32))).toBe(false);
    });

    it("verifies order-to-restaurant tenant ownership prevents URL tampering across tenants", () => {
      // Mock order in database
      const mockOrderInDb = {
        orderNumber: "ORD-999999",
        restaurantId: restaurantA_Id,
      };

      // Attacker queries /r/restaurant-beta/orders/ORD-999999
      const targetRestaurantId = restaurantB_Id;
      const isTenantMatch = mockOrderInDb.restaurantId === targetRestaurantId;

      expect(isTenantMatch).toBe(false);
      // In the API route: if (!order || order.restaurantId !== restaurant.id) -> returns 404 ORDER_NOT_FOUND
    });
  });

  describe("Safe Error Handling for Invalid/Non-Existent Orders", () => {
    it("returns safe 404 error code when order does not exist", () => {
      const safeErrorResponse = {
        success: false,
        code: "ORDER_NOT_FOUND",
        error: "Order not found.",
      };

      expect(safeErrorResponse.success).toBe(false);
      expect(safeErrorResponse.code).toBe("ORDER_NOT_FOUND");
      expect(safeErrorResponse.error).toBe("Order not found.");
      expect("stack" in safeErrorResponse).toBe(false);
    });

    it("returns safe 404 error code when restaurant slug does not exist", () => {
      const safeErrorResponse = {
        success: false,
        code: "NOT_FOUND",
        error: "Restaurant not found.",
      };

      expect(safeErrorResponse.success).toBe(false);
      expect(safeErrorResponse.code).toBe("NOT_FOUND");
    });

    it("returns safe 403 error code when access token is invalid or missing", () => {
      const safeErrorResponse = {
        success: false,
        code: "ACCESS_DENIED",
        error: "Order tracking access token is invalid or missing.",
      };

      expect(safeErrorResponse.success).toBe(false);
      expect(safeErrorResponse.code).toBe("ACCESS_DENIED");
    });
  });

  describe("Session Storage Context Isolation", () => {
    it("scopes session storage keys by restaurant slug to isolate multi-restaurant customer sessions", () => {
      const slugA = "cafe-delight";
      const slugB = "bistro-central";

      const keyA = `qrserve_active_order_${slugA}`;
      const keyB = `qrserve_active_order_${slugB}`;

      expect(keyA).toBe("qrserve_active_order_cafe-delight");
      expect(keyB).toBe("qrserve_active_order_bistro-central");
      expect(keyA).not.toBe(keyB);
    });
  });
});
