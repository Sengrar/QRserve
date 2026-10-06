import { describe, it, expect } from "vitest";
import { CreateOrderSchema, OrderItemInputSchema } from "@/lib/validations/order";

describe("Customer Cart & Order Validations", () => {
  describe("OrderItemInputSchema", () => {
    it("accepts valid item with positive quantity", () => {
      const result = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 2,
        notes: "Extra spicy",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe(2);
        expect(result.data.notes).toBe("Extra spicy");
      }
    });

    it("rejects non-positive quantities (zero or negative)", () => {
      const zeroQty = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 0,
      });
      expect(zeroQty.success).toBe(false);

      const negQty = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: -3,
      });
      expect(negQty.success).toBe(false);
    });

    it("rejects fractional or non-integer quantities", () => {
      const floatQty = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 1.5,
      });
      expect(floatQty.success).toBe(false);
    });

    it("enforces sensible upper limit per item (max 50)", () => {
      const validMax = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 50,
      });
      expect(validMax.success).toBe(true);

      const overMax = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 51,
      });
      expect(overMax.success).toBe(false);
    });

    it("enforces item instructions length limit (max 200 chars)", () => {
      const longNote = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 1,
        notes: "A".repeat(201),
      });
      expect(longNote.success).toBe(false);

      const validNote = OrderItemInputSchema.safeParse({
        menuItemId: "item_123",
        quantity: 1,
        notes: "A".repeat(200),
      });
      expect(validNote.success).toBe(true);
    });
  });

  describe("CreateOrderSchema", () => {
    it("rejects empty cart submission", () => {
      const result = CreateOrderSchema.safeParse({
        items: [],
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Order must contain at least one item.");
      }
    });

    it("accepts valid order with table QR token and customer notes", () => {
      const result = CreateOrderSchema.safeParse({
        qrToken: "qr_7f8a9b1c2d3e4f5061728394a5b6c7d8",
        customerNotes: "Please deliver cutlery with food.",
        idempotencyKey: "idem_abc12345",
        items: [
          { menuItemId: "item_1", quantity: 2 },
          { menuItemId: "item_2", quantity: 1, notes: "No onions" },
        ],
      });
      expect(result.success).toBe(true);
    });

    it("accepts valid order without table QR (counter / takeaway mode)", () => {
      const result = CreateOrderSchema.safeParse({
        qrToken: null,
        tableNumber: null,
        items: [{ menuItemId: "item_1", quantity: 1 }],
      });
      expect(result.success).toBe(true);
    });

    it("rejects customer notes exceeding 500 characters", () => {
      const result = CreateOrderSchema.safeParse({
        customerNotes: "x".repeat(501),
        items: [{ menuItemId: "item_1", quantity: 1 }],
      });
      expect(result.success).toBe(false);
    });

    it("enforces order item count limit (max 100 items)", () => {
      const items = Array.from({ length: 101 }, (_, i) => ({
        menuItemId: `item_${i}`,
        quantity: 1,
      }));
      const result = CreateOrderSchema.safeParse({ items });
      expect(result.success).toBe(false);
    });
  });
});
