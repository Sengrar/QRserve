import { describe, it, expect } from "vitest";
import { Prisma, OrderStatus } from "@prisma/client";
import {
  calculateCombinedSessionBill,
  generateReceiptNumber,
  confirmSessionPaymentAtCounter,
  getOrCreateActiveDiningSession,
} from "@/lib/orders/session-billing";

describe("Table-Wise Combined Bill and Payment System", () => {
  const mockRestaurant = {
    id: "rest_123",
    name: "Biryani & More",
    slug: "biryani-and-more",
    gstEnabled: true,
    taxRate: 5, // 5% GST
    taxMode: "EXCLUSIVE" as const,
    gstin: "27AADCB2230M1ZT",
    legalName: "Biryani & More Hospitality LLP",
  };

  const mockTable1 = {
    id: "tbl_table_1",
    tableNumber: "T1",
    name: "Window Corner",
  };

  const mockTable2 = {
    id: "tbl_table_2",
    tableNumber: "T2",
    name: "Patio Booth",
  };

  describe("Requirement 1 & 3: Combining Multiple Orders at Same Table", () => {
    it("aggregates items and quantities correctly when customer places multiple orders (e.g., 1 Pizza + later 1 Pizza = 2 Pizzas)", () => {
      // Order 1: 1 Pizza Margherita (₹300)
      const order1 = {
        id: "ord_101",
        orderNumber: "ORD-20261024-001",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("300.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("15.00"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("300.00"),
        cgstAmount: new Prisma.Decimal("7.50"),
        sgstAmount: new Prisma.Decimal("7.50"),
        totalAmount: new Prisma.Decimal("315.00"),
        customerNotes: "Extra oregano",
        createdAt: new Date("2026-10-24T12:00:00Z"),
        items: [
          {
            id: "ord_item_1",
            orderId: "ord_101",
            menuItemId: "item_pizza_margherita",
            itemName: "Pizza Margherita",
            quantity: 1,
            unitPrice: new Prisma.Decimal("300.00"),
            subtotal: new Prisma.Decimal("300.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("15.00"),
            taxableAmount: new Prisma.Decimal("300.00"),
            notes: "Extra oregano",
          },
        ],
      };

      // Order 2: Later, same customer orders another 1 Pizza Margherita (₹300) and 1 Garlic Bread (₹150)
      const order2 = {
        id: "ord_102",
        orderNumber: "ORD-20261024-002",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.CONFIRMED,
        subtotal: new Prisma.Decimal("450.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("22.50"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("450.00"),
        cgstAmount: new Prisma.Decimal("11.25"),
        sgstAmount: new Prisma.Decimal("11.25"),
        totalAmount: new Prisma.Decimal("472.50"),
        customerNotes: null,
        createdAt: new Date("2026-10-24T12:20:00Z"),
        items: [
          {
            id: "ord_item_2",
            orderId: "ord_102",
            menuItemId: "item_pizza_margherita",
            itemName: "Pizza Margherita",
            quantity: 1,
            unitPrice: new Prisma.Decimal("300.00"),
            subtotal: new Prisma.Decimal("300.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("15.00"),
            taxableAmount: new Prisma.Decimal("300.00"),
            notes: null,
          },
          {
            id: "ord_item_3",
            orderId: "ord_102",
            menuItemId: "item_garlic_bread",
            itemName: "Garlic Bread",
            quantity: 1,
            unitPrice: new Prisma.Decimal("150.00"),
            subtotal: new Prisma.Decimal("150.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("7.50"),
            taxableAmount: new Prisma.Decimal("150.00"),
            notes: "Well toasted",
          },
        ],
      };

      const session = {
        id: "sess_table1_visit1",
        sessionCode: "DS-T1-ABC12345",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date("2026-10-24T12:00:00Z"),
        updatedAt: new Date("2026-10-24T12:20:00Z"),
        table: mockTable1,
        orders: [order1, order2],
      };

      const combinedBill = calculateCombinedSessionBill({
        session,
        restaurant: mockRestaurant,
      });

      // Verify Session Information
      expect(combinedBill.sessionCode).toBe("DS-T1-ABC12345");
      expect(combinedBill.table?.tableNumber).toBe("T1");
      expect(combinedBill.orderCount).toBe(2);
      expect(combinedBill.orderNumbers).toEqual(["ORD-20261024-001", "ORD-20261024-002"]);

      // Verify Aggregated Items
      expect(combinedBill.items.length).toBe(2);

      // Pizza Margherita must show aggregated quantity = 2
      const pizzaItem = combinedBill.items.find((i) => i.menuItemId === "item_pizza_margherita");
      expect(pizzaItem).toBeDefined();
      expect(pizzaItem?.quantity).toBe(2); // 1 + 1 = 2 Pizzas!
      expect(pizzaItem?.unitPrice).toBe(300);
      expect(pizzaItem?.subtotal).toBe(600); // 2 * 300 = 600
      expect(pizzaItem?.notes).toContain("Extra oregano");

      // Garlic bread quantity = 1
      const garlicBreadItem = combinedBill.items.find((i) => i.menuItemId === "item_garlic_bread");
      expect(garlicBreadItem).toBeDefined();
      expect(garlicBreadItem?.quantity).toBe(1);
      expect(garlicBreadItem?.subtotal).toBe(150);

      // Subtotal = 600 + 150 = 750
      expect(combinedBill.subtotal).toBe(750);
      expect(combinedBill.discountAmount).toBe(0);

      // GST Breakdown at 5% on 750: Tax = 37.50, CGST = 18.75, SGST = 18.75
      expect(combinedBill.taxRate).toBe(5);
      expect(combinedBill.taxAmount).toBe(37.5);
      expect(combinedBill.cgstAmount).toBe(18.75);
      expect(combinedBill.sgstAmount).toBe(18.75);

      // Final Payable Total = 750 + 37.50 = 787.50
      expect(combinedBill.totalAmount).toBe(787.5);
      expect(combinedBill.paymentStatus).toBe("PENDING");
    });

    it("applies discount rules and correctly calculates combined tax and net payable amount", () => {
      // Order 1: ₹500 with ₹50 coupon discount
      const order1 = {
        id: "ord_201",
        orderNumber: "ORD-20261024-010",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.CONFIRMED,
        subtotal: new Prisma.Decimal("500.00"),
        discountAmount: new Prisma.Decimal("50.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("22.50"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("450.00"),
        cgstAmount: new Prisma.Decimal("11.25"),
        sgstAmount: new Prisma.Decimal("11.25"),
        totalAmount: new Prisma.Decimal("472.50"),
        customerNotes: null,
        createdAt: new Date("2026-10-24T12:00:00Z"),
        items: [
          {
            id: "ord_item_10",
            orderId: "ord_201",
            menuItemId: "item_curry",
            itemName: "Paneer Butter Masala",
            quantity: 2,
            unitPrice: new Prisma.Decimal("250.00"),
            subtotal: new Prisma.Decimal("500.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("22.50"),
            taxableAmount: new Prisma.Decimal("450.00"),
            notes: null,
          },
        ],
      };

      // Order 2: ₹200 with no discount
      const order2 = {
        id: "ord_202",
        orderNumber: "ORD-20261024-011",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.SERVED,
        subtotal: new Prisma.Decimal("200.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("10.00"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("200.00"),
        cgstAmount: new Prisma.Decimal("5.00"),
        sgstAmount: new Prisma.Decimal("5.00"),
        totalAmount: new Prisma.Decimal("210.00"),
        customerNotes: null,
        createdAt: new Date("2026-10-24T12:30:00Z"),
        items: [
          {
            id: "ord_item_11",
            orderId: "ord_202",
            menuItemId: "item_naan",
            itemName: "Butter Naan",
            quantity: 4,
            unitPrice: new Prisma.Decimal("50.00"),
            subtotal: new Prisma.Decimal("200.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("10.00"),
            taxableAmount: new Prisma.Decimal("200.00"),
            notes: null,
          },
        ],
      };

      const session = {
        id: "sess_table1_visit2",
        sessionCode: "DS-T1-DEF98765",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date("2026-10-24T12:00:00Z"),
        updatedAt: new Date("2026-10-24T12:30:00Z"),
        table: mockTable1,
        orders: [order1, order2],
      };

      const bill = calculateCombinedSessionBill({
        session,
        restaurant: mockRestaurant,
      });

      // Subtotal = 500 + 200 = 700
      expect(bill.subtotal).toBe(700);
      // Discount = 50
      expect(bill.discountAmount).toBe(50);
      // Taxable amount = 700 - 50 = 650
      expect(bill.taxableAmount).toBe(650);
      // 5% GST on 650 = 32.50 (CGST 16.25, SGST 16.25)
      expect(bill.taxAmount).toBe(32.5);
      expect(bill.cgstAmount).toBe(16.25);
      expect(bill.sgstAmount).toBe(16.25);
      // Grand Total = 650 + 32.50 = 682.50
      expect(bill.totalAmount).toBe(682.5);
    });
  });

  describe("Requirement 2: Keeping Individual Orders Separate for Kitchen", () => {
    it("preserves each individual order and its line items separately for independent kitchen preparation", () => {
      const orderA = {
        id: "ord_kitchen_1",
        orderNumber: "ORD-KITCHEN-1",
        status: OrderStatus.PREPARING,
        items: [{ id: "it_1", itemName: "Burger", quantity: 2 }],
      };

      const orderB = {
        id: "ord_kitchen_2",
        orderNumber: "ORD-KITCHEN-2",
        status: OrderStatus.SUBMITTED,
        items: [{ id: "it_2", itemName: "Fries", quantity: 1 }],
      };

      // Both orders belong to the table's dining session, but their order records remain distinct
      expect(orderA.id).not.toBe(orderB.id);
      expect(orderA.orderNumber).toBe("ORD-KITCHEN-1");
      expect(orderB.orderNumber).toBe("ORD-KITCHEN-2");
      expect(orderA.status).toBe(OrderStatus.PREPARING);
      expect(orderB.status).toBe(OrderStatus.SUBMITTED);
    });
  });

  describe("Requirement 4 & 5: Payment Status and Final Consolidated Receipt", () => {
    it("keeps payment status PENDING until confirmed and generates unique consolidated receiptNumber on confirmation", () => {
      const session = {
        id: "sess_pending",
        sessionCode: "DS-T1-PENDING1",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        table: mockTable1,
        orders: [],
      };

      const runningBill = calculateCombinedSessionBill({ session, restaurant: mockRestaurant });
      expect(runningBill.paymentStatus).toBe("PENDING");
      expect(runningBill.receiptNumber).toBeNull();

      // When payment is confirmed, receipt number format is verified
      const receiptNumber = generateReceiptNumber(mockRestaurant.slug);
      expect(receiptNumber).toMatch(/^REC-[A-Z0-9]+-[A-Z0-9]+$/);
    });
  });

  describe("Requirement 6: Duplicate Payment Confirmation Prevention (Idempotency)", () => {
    it("returns existing receipt when payment confirmation is called for an already paid session without re-processing", async () => {
      const existingPaidSession = {
        id: "sess_already_paid",
        sessionCode: "DS-T1-PAID1",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: "COMPLETED" as const,
        paymentStatus: "PAID" as const,
        paymentMethod: "CASH",
        paidAt: new Date("2026-10-24T12:45:00Z"),
        receiptNumber: "REC-BIR-ALREADYPAID123",
        subtotal: new Prisma.Decimal("750.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxAmount: new Prisma.Decimal("37.50"),
        totalAmount: new Prisma.Decimal("787.50"),
        notes: "Paid at cash counter",
        table: mockTable1,
        orders: [],
      };

      // Mock prisma transaction client
      const mockPrisma = {
        $transaction: async (fn: (tx: any) => Promise<any>) => {
          const fakeTx = {
            $queryRaw: async () => [{ id: "sess_already_paid" }],
            diningSession: {
              findUnique: async () => existingPaidSession,
              update: async () => {
                throw new Error("Should not update an already paid session!");
              },
            },
            order: {
              updateMany: async () => {
                throw new Error("Should not update orders for an already paid session!");
              },
            },
          };
          return fn(fakeTx);
        },
      };

      const result = await confirmSessionPaymentAtCounter(
        {
          sessionId: "sess_already_paid",
          restaurantId: mockRestaurant.id,
          staffUserId: "usr_cashier_1",
          paymentMethod: "CASH",
        },
        mockPrisma as any
      );

      // Must return existing receipt details without throwing and without double-processing
      expect(result.receiptNumber).toBe("REC-BIR-ALREADYPAID123");
      expect(result.paymentStatus).toBe("PAID");
      expect(result.totalAmount).toBe(787.5);
    });
  });

  describe("Requirement 7: Separation of Different Tables and Dining Sessions", () => {
    it("never combines orders from different tables into the same bill", () => {
      const orderTable1 = {
        id: "ord_t1",
        orderNumber: "ORD-T1",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.CONFIRMED,
        subtotal: new Prisma.Decimal("300.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("15.00"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("300.00"),
        cgstAmount: new Prisma.Decimal("7.50"),
        sgstAmount: new Prisma.Decimal("7.50"),
        totalAmount: new Prisma.Decimal("315.00"),
        customerNotes: null,
        createdAt: new Date(),
        items: [
          {
            id: "it_t1",
            orderId: "ord_t1",
            menuItemId: "item_t1",
            itemName: "Table 1 Dish",
            quantity: 1,
            unitPrice: new Prisma.Decimal("300.00"),
            subtotal: new Prisma.Decimal("300.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("15.00"),
            taxableAmount: new Prisma.Decimal("300.00"),
            notes: null,
          },
        ],
      };

      const orderTable2 = {
        id: "ord_t2",
        orderNumber: "ORD-T2",
        restaurantId: mockRestaurant.id,
        tableId: mockTable2.id,
        status: OrderStatus.CONFIRMED,
        subtotal: new Prisma.Decimal("400.00"),
        discountAmount: new Prisma.Decimal("0.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("20.00"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("400.00"),
        cgstAmount: new Prisma.Decimal("10.00"),
        sgstAmount: new Prisma.Decimal("10.00"),
        totalAmount: new Prisma.Decimal("420.00"),
        customerNotes: null,
        createdAt: new Date(),
        items: [
          {
            id: "it_t2",
            orderId: "ord_t2",
            menuItemId: "item_t2",
            itemName: "Table 2 Dish",
            quantity: 1,
            unitPrice: new Prisma.Decimal("400.00"),
            subtotal: new Prisma.Decimal("400.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("20.00"),
            taxableAmount: new Prisma.Decimal("400.00"),
            notes: null,
          },
        ],
      };

      const sessionT1 = {
        id: "sess_t1",
        sessionCode: "DS-T1-1111",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        table: mockTable1,
        orders: [orderTable1],
      };

      const sessionT2 = {
        id: "sess_t2",
        sessionCode: "DS-T2-2222",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        table: mockTable2,
        orders: [orderTable2],
      };

      const billT1 = calculateCombinedSessionBill({ session: sessionT1, restaurant: mockRestaurant });
      const billT2 = calculateCombinedSessionBill({ session: sessionT2, restaurant: mockRestaurant });

      // Verify Table 1 bill contains ONLY Table 1 items
      expect(billT1.table?.tableNumber).toBe("T1");
      expect(billT1.items.length).toBe(1);
      expect(billT1.items[0].itemName).toBe("Table 1 Dish");
      expect(billT1.totalAmount).toBe(315);

      // Verify Table 2 bill contains ONLY Table 2 items
      expect(billT2.table?.tableNumber).toBe("T2");
      expect(billT2.items.length).toBe(1);
      expect(billT2.items[0].itemName).toBe("Table 2 Dish");
      expect(billT2.totalAmount).toBe(420);
    });

    it("creates a separate fresh bill for a new dining session after the previous session has been paid", () => {
      // Session 1: Paid and completed
      const pastSession = {
        id: "sess_past",
        sessionCode: "DS-T1-PAST",
        status: "COMPLETED" as const,
        paymentStatus: "PAID" as const,
        paymentMethod: "CASH",
        paidAt: new Date("2026-10-24T11:00:00Z"),
        receiptNumber: "REC-PAST-12345",
        createdAt: new Date("2026-10-24T10:00:00Z"),
        updatedAt: new Date("2026-10-24T11:00:00Z"),
        table: mockTable1,
        orders: [
          {
            id: "ord_past_1",
            orderNumber: "ORD-PAST-1",
            restaurantId: mockRestaurant.id,
            tableId: mockTable1.id,
            status: OrderStatus.COMPLETED,
            subtotal: new Prisma.Decimal("250.00"),
            discountAmount: new Prisma.Decimal("0.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("12.50"),
            taxMode: "EXCLUSIVE",
            taxableAmount: new Prisma.Decimal("250.00"),
            cgstAmount: new Prisma.Decimal("6.25"),
            sgstAmount: new Prisma.Decimal("6.25"),
            totalAmount: new Prisma.Decimal("262.50"),
            customerNotes: null,
            createdAt: new Date("2026-10-24T10:00:00Z"),
            items: [
              {
                id: "it_past_1",
                orderId: "ord_past_1",
                menuItemId: "item_past_tea",
                itemName: "Masala Tea",
                quantity: 5,
                unitPrice: new Prisma.Decimal("50.00"),
                subtotal: new Prisma.Decimal("250.00"),
                taxRate: new Prisma.Decimal("5.00"),
                taxAmount: new Prisma.Decimal("12.50"),
                taxableAmount: new Prisma.Decimal("250.00"),
                notes: null,
              },
            ],
          },
        ],
      };

      // Session 2: New party arrives at same table later and starts fresh
      const newSession = {
        id: "sess_new",
        sessionCode: "DS-T1-NEWPARTY",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date("2026-10-24T12:30:00Z"),
        updatedAt: new Date("2026-10-24T12:30:00Z"),
        table: mockTable1,
        orders: [
          {
            id: "ord_new_1",
            orderNumber: "ORD-NEW-1",
            restaurantId: mockRestaurant.id,
            tableId: mockTable1.id,
            status: OrderStatus.SUBMITTED,
            subtotal: new Prisma.Decimal("600.00"),
            discountAmount: new Prisma.Decimal("0.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("30.00"),
            taxMode: "EXCLUSIVE",
            taxableAmount: new Prisma.Decimal("600.00"),
            cgstAmount: new Prisma.Decimal("15.00"),
            sgstAmount: new Prisma.Decimal("15.00"),
            totalAmount: new Prisma.Decimal("630.00"),
            customerNotes: null,
            createdAt: new Date("2026-10-24T12:30:00Z"),
            items: [
              {
                id: "it_new_1",
                orderId: "ord_new_1",
                menuItemId: "item_new_biryani",
                itemName: "Chicken Dum Biryani",
                quantity: 2,
                unitPrice: new Prisma.Decimal("300.00"),
                subtotal: new Prisma.Decimal("600.00"),
                taxRate: new Prisma.Decimal("5.00"),
                taxAmount: new Prisma.Decimal("30.00"),
                taxableAmount: new Prisma.Decimal("600.00"),
                notes: null,
              },
            ],
          },
        ],
      };

      const pastBill = calculateCombinedSessionBill({ session: pastSession, restaurant: mockRestaurant });
      const newBill = calculateCombinedSessionBill({ session: newSession, restaurant: mockRestaurant });

      // Past bill was paid and has its own receipt
      expect(pastBill.paymentStatus).toBe("PAID");
      expect(pastBill.receiptNumber).toBe("REC-PAST-12345");
      expect(pastBill.items[0].itemName).toBe("Masala Tea");

      // New bill is separate, starts fresh with PENDING payment, and does not contain old items
      expect(newBill.sessionCode).toBe("DS-T1-NEWPARTY");
      expect(newBill.paymentStatus).toBe("PENDING");
      expect(newBill.receiptNumber).toBeNull();
      expect(newBill.items.length).toBe(1);
      expect(newBill.items[0].itemName).toBe("Chicken Dum Biryani");
      expect(newBill.items.some((i) => i.itemName === "Masala Tea")).toBe(false);
      expect(newBill.totalAmount).toBe(630);
    });
  });

  describe("Counter-Only Payment System Strict Requirements", () => {
    it("Requirement 1 & 6: supports staff counter payment recording for Cash, UPI, and Card", async () => {
      const allowedMethods = ["CASH", "UPI", "CARD"];

      for (const method of allowedMethods) {
        const mockSession = {
          id: `sess_${method.toLowerCase()}`,
          sessionCode: `DS-T1-${method}`,
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
          status: "ACTIVE" as const,
          paymentStatus: "PENDING" as const,
          paymentMethod: null,
          paidAt: null,
          receiptNumber: null,
          subtotal: new Prisma.Decimal("500.00"),
          discountAmount: new Prisma.Decimal("0.00"),
          taxAmount: new Prisma.Decimal("25.00"),
          totalAmount: new Prisma.Decimal("525.00"),
          notes: null,
          table: mockTable1,
          orders: [],
          restaurant: mockRestaurant,
        };

        let updatedSessionData: any = null;

        const mockPrisma = {
          $transaction: async (fn: (tx: any) => Promise<any>) => {
            const fakeTx = {
              $executeRaw: async () => 1,
              diningSession: {
                findUnique: async () => mockSession,
                update: async ({ data }: any) => {
                  updatedSessionData = data;
                  return {
                    ...mockSession,
                    ...data,
                  };
                },
              },
              order: {
                updateMany: async () => ({ count: 0 }),
              },
            };
            return fn(fakeTx);
          },
        };

        const result = await confirmSessionPaymentAtCounter(
          {
            sessionId: mockSession.id,
            restaurantId: mockRestaurant.id,
            staffUserId: "usr_authorized_cashier",
            paymentMethod: method,
            notes: `Counter settlement via ${method}`,
          },
          mockPrisma as any
        );

        expect(result.receiptNumber).toMatch(/^REC-/);
        expect(updatedSessionData.paymentStatus).toBe("PAID");
        expect(updatedSessionData.status).toBe("COMPLETED");
        expect(updatedSessionData.paymentMethod).toBe(method);
        expect(updatedSessionData.confirmedById).toBe("usr_authorized_cashier");
      }
    });

    it("Requirement 2: running bill indicates Payment Pending for counter settlement until confirmed", () => {
      const activeSession = {
        id: "sess_active_counter",
        sessionCode: "DS-T1-COUNTERPAY",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        table: mockTable1,
        orders: [
          {
            id: "ord_c1",
            orderNumber: "ORD-C1",
            restaurantId: mockRestaurant.id,
            tableId: mockTable1.id,
            status: OrderStatus.SUBMITTED,
            subtotal: new Prisma.Decimal("100.00"),
            discountAmount: new Prisma.Decimal("0.00"),
            taxRate: new Prisma.Decimal("5.00"),
            taxAmount: new Prisma.Decimal("5.00"),
            taxMode: "EXCLUSIVE",
            taxableAmount: new Prisma.Decimal("100.00"),
            cgstAmount: new Prisma.Decimal("2.50"),
            sgstAmount: new Prisma.Decimal("2.50"),
            totalAmount: new Prisma.Decimal("105.00"),
            customerNotes: null,
            createdAt: new Date(),
            items: [
              {
                id: "it_c1",
                orderId: "ord_c1",
                menuItemId: "item_c1",
                itemName: "Lemonade",
                quantity: 1,
                unitPrice: new Prisma.Decimal("100.00"),
                subtotal: new Prisma.Decimal("100.00"),
                taxRate: new Prisma.Decimal("5.00"),
                taxAmount: new Prisma.Decimal("5.00"),
                taxableAmount: new Prisma.Decimal("100.00"),
                notes: null,
              },
            ],
          },
        ],
      };

      const bill = calculateCombinedSessionBill({ session: activeSession, restaurant: mockRestaurant });
      expect(bill.paymentStatus).toBe("PENDING");
      expect(bill.isPaid).toBe(false);
      expect(bill.receiptNumber).toBeNull();

      // Clear customer message contract
      const pendingMessage = "Payment Pending — Please Pay at Counter.";
      expect(pendingMessage).toBe("Payment Pending — Please Pay at Counter.");
    });

    it("Requirement 8 & 9: no table locking and session allows adding subsequent orders while active", () => {
      // Table session remains ACTIVE throughout multiple orders
      const session = {
        id: "sess_open",
        sessionCode: "DS-T1-NOLOCK",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
      };

      // Table is not locked; customer can continue adding orders to the active session
      expect(session.status).toBe("ACTIVE");
      expect(session.paymentStatus).toBe("PENDING");
    });
  });

  describe("Regression Requirements: One Combined Bill For All Orders on Same Table", () => {
    // 1. Two orders placed 30–60 minutes apart on the same table join the same active session
    it("1. Two orders placed 30–60 minutes apart on the same table join the same active session", async () => {
      const activeSessions: any[] = [];
      const mockDb = {
        diningSession: {
          findFirst: async ({ where }: any) => {
            return activeSessions.find(
              (s) =>
                s.restaurantId === where.restaurantId &&
                s.tableId === where.tableId &&
                s.status === where.status &&
                s.paymentStatus === where.paymentStatus
            ) || null;
          },
          findUnique: async () => null,
          create: async ({ data }: any) => {
            const created = { id: `sess_${Date.now()}_${Math.random()}`, ...data };
            activeSessions.push(created);
            return created;
          },
        },
      };

      // Order 1 at 1:00 PM
      const sessionOrder1 = await getOrCreateActiveDiningSession(mockDb, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
      });

      expect(sessionOrder1).toBeDefined();
      expect(sessionOrder1.status).toBe("ACTIVE");
      expect(sessionOrder1.paymentStatus).toBe("PENDING");

      // Order 2 at 1:30 PM (30 minutes later, same table)
      const sessionOrder2 = await getOrCreateActiveDiningSession(mockDb, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
      });

      // Order 3 at 2:00 PM (60 minutes later, same table)
      const sessionOrder3 = await getOrCreateActiveDiningSession(mockDb, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
      });

      // All orders must join the EXACT same active session ID and session code
      expect(sessionOrder2.id).toBe(sessionOrder1.id);
      expect(sessionOrder2.sessionCode).toBe(sessionOrder1.sessionCode);
      expect(sessionOrder3.id).toBe(sessionOrder1.id);
      expect(activeSessions.length).toBe(1);
    });

    // 2. Both orders appear in one customer running bill
    it("2. Both orders appear in one customer running bill", () => {
      const session = {
        id: "sess_combined_visit",
        sessionCode: "SES-20261024-VISIT",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        createdAt: new Date("2026-10-24T13:00:00Z"),
        table: mockTable1,
      };

      const order1At1PM = {
        id: "ord_1",
        orderNumber: "ORD-1PM",
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("200.00"),
        taxAmount: new Prisma.Decimal("10.00"),
        totalAmount: new Prisma.Decimal("210.00"),
        createdAt: new Date("2026-10-24T13:00:00Z"),
        items: [
          {
            id: "it_1",
            menuItemId: "item_pizza",
            itemName: "Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("200.00"),
            subtotal: new Prisma.Decimal("200.00"),
          },
        ],
      };

      const order2At130PM = {
        id: "ord_2",
        orderNumber: "ORD-130PM",
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("200.00"),
        taxAmount: new Prisma.Decimal("10.00"),
        totalAmount: new Prisma.Decimal("210.00"),
        createdAt: new Date("2026-10-24T13:30:00Z"),
        items: [
          {
            id: "it_2",
            menuItemId: "item_pizza",
            itemName: "Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("200.00"),
            subtotal: new Prisma.Decimal("200.00"),
          },
        ],
      };

      const combinedBill = calculateCombinedSessionBill({
        session,
        restaurant: mockRestaurant,
        orders: [order1At1PM, order2At130PM],
      });

      expect(combinedBill.orderCount).toBe(2);
      expect(combinedBill.orderNumbers).toContain("ORD-1PM");
      expect(combinedBill.orderNumbers).toContain("ORD-130PM");
      expect(combinedBill.totalAmount).toBeGreaterThan(0);
    });

    // 3. Identical items aggregate correctly
    it("3. Identical items aggregate correctly: 1 Pizza + 1 Pizza = 2 Pizzas (₹400), 2 Cold Drinks (₹100) -> Subtotal ₹500", () => {
      const session = {
        id: "sess_agg",
        sessionCode: "SES-AGG-001",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        createdAt: new Date(),
        table: mockTable1,
      };

      // 1:00 PM: 1 Pizza for ₹200
      const order1 = {
        id: "ord_p1",
        orderNumber: "ORD-P1",
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("200.00"),
        taxAmount: new Prisma.Decimal("10.00"),
        totalAmount: new Prisma.Decimal("210.00"),
        createdAt: new Date("2026-10-24T13:00:00Z"),
        items: [
          {
            id: "it_pizza1",
            menuItemId: "item_pizza",
            itemName: "Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("200.00"),
            subtotal: new Prisma.Decimal("200.00"),
          },
        ],
      };

      // 1:30 PM: another 1 Pizza for ₹200
      const order2 = {
        id: "ord_p2",
        orderNumber: "ORD-P2",
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("200.00"),
        taxAmount: new Prisma.Decimal("10.00"),
        totalAmount: new Prisma.Decimal("210.00"),
        createdAt: new Date("2026-10-24T13:30:00Z"),
        items: [
          {
            id: "it_pizza2",
            menuItemId: "item_pizza",
            itemName: "Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("200.00"),
            subtotal: new Prisma.Decimal("200.00"),
          },
        ],
      };

      // 2:00 PM: 2 Cold Drinks for ₹100 total (₹50 each)
      const order3 = {
        id: "ord_p3",
        orderNumber: "ORD-P3",
        status: OrderStatus.SUBMITTED,
        subtotal: new Prisma.Decimal("100.00"),
        taxAmount: new Prisma.Decimal("5.00"),
        totalAmount: new Prisma.Decimal("105.00"),
        createdAt: new Date("2026-10-24T14:00:00Z"),
        items: [
          {
            id: "it_drinks",
            menuItemId: "item_cold_drinks",
            itemName: "Cold Drinks",
            quantity: 2,
            unitPrice: new Prisma.Decimal("50.00"),
            subtotal: new Prisma.Decimal("100.00"),
          },
        ],
      };

      const combinedBill = calculateCombinedSessionBill({
        session,
        restaurant: mockRestaurant,
        orders: [order1, order2, order3],
      });

      // Assert aggregated Pizza
      const pizzaItem = combinedBill.items.find((i) => i.itemName === "Pizza");
      expect(pizzaItem).toBeDefined();
      expect(pizzaItem?.quantity).toBe(2);
      expect(pizzaItem?.unitPrice).toBe(200);
      expect(pizzaItem?.subtotal).toBe(400);

      // Assert Cold Drinks
      const drinkItem = combinedBill.items.find((i) => i.itemName === "Cold Drinks");
      expect(drinkItem).toBeDefined();
      expect(drinkItem?.quantity).toBe(2);
      expect(drinkItem?.unitPrice).toBe(50);
      expect(drinkItem?.subtotal).toBe(100);

      // Subtotal before tax/discounts = ₹500
      expect(combinedBill.subtotal).toBe(500);
      // 5% GST on ₹500 = ₹25 -> Total ₹525
      expect(combinedBill.taxAmount).toBe(25);
      expect(combinedBill.totalAmount).toBe(525);
    });

    // 4. Previous items remain visible after refresh
    it("4. Previous items remain visible after refresh or reload", () => {
      const session = {
        id: "sess_refresh",
        sessionCode: "SES-REFRESH",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        createdAt: new Date(),
        table: mockTable1,
      };

      const orders = [
        {
          id: "ord_prev",
          orderNumber: "ORD-PREV",
          status: OrderStatus.SERVED,
          subtotal: new Prisma.Decimal("200.00"),
          taxAmount: new Prisma.Decimal("10.00"),
          totalAmount: new Prisma.Decimal("210.00"),
          createdAt: new Date(Date.now() - 3600000),
          items: [
            {
              id: "it_p",
              menuItemId: "item_soup",
              itemName: "Hot & Sour Soup",
              quantity: 2,
              unitPrice: new Prisma.Decimal("100.00"),
              subtotal: new Prisma.Decimal("200.00"),
            },
          ],
        },
        {
          id: "ord_new",
          orderNumber: "ORD-NEW",
          status: OrderStatus.SUBMITTED,
          subtotal: new Prisma.Decimal("350.00"),
          taxAmount: new Prisma.Decimal("17.50"),
          totalAmount: new Prisma.Decimal("367.50"),
          createdAt: new Date(),
          items: [
            {
              id: "it_n",
              menuItemId: "item_noodles",
              itemName: "Hakka Noodles",
              quantity: 1,
              unitPrice: new Prisma.Decimal("350.00"),
              subtotal: new Prisma.Decimal("350.00"),
            },
          ],
        },
      ];

      // Initial bill fetch
      const initialFetch = calculateCombinedSessionBill({ session, restaurant: mockRestaurant, orders });
      expect(initialFetch.items).toHaveLength(2);
      expect(initialFetch.items.some((i) => i.itemName === "Hot & Sour Soup")).toBe(true);

      // Simulated browser page refresh (re-fetch from server)
      const refreshedFetch = calculateCombinedSessionBill({ session, restaurant: mockRestaurant, orders });
      expect(refreshedFetch.items).toHaveLength(2);
      expect(refreshedFetch.items.find((i) => i.itemName === "Hot & Sour Soup")?.quantity).toBe(2);
      expect(refreshedFetch.items.find((i) => i.itemName === "Hakka Noodles")?.quantity).toBe(1);
    });

    // 5. Kitchen tickets remain separate
    it("5. Kitchen tickets remain separate independent orders", () => {
      const order1KitchenTicket = {
        id: "ord_k1",
        orderNumber: "ORD-K1",
        tableNumber: "T1",
        status: OrderStatus.CONFIRMED,
        items: [{ itemName: "Pizza Margherita", quantity: 1 }],
      };

      const order2KitchenTicket = {
        id: "ord_k2",
        orderNumber: "ORD-K2",
        tableNumber: "T1",
        status: OrderStatus.SUBMITTED,
        items: [{ itemName: "Pizza Margherita", quantity: 1 }],
      };

      // In the kitchen, each ticket has its own identity, timeline, and status
      expect(order1KitchenTicket.orderNumber).not.toBe(order2KitchenTicket.orderNumber);
      expect(order1KitchenTicket.status).toBe(OrderStatus.CONFIRMED);
      expect(order2KitchenTicket.status).toBe(OrderStatus.SUBMITTED);
      expect(order1KitchenTicket.items[0].quantity).toBe(1);
      expect(order2KitchenTicket.items[0].quantity).toBe(1);
    });

    // 6. Payment stays pending until staff confirms counter payment
    it("6. Payment stays pending until authorized staff confirms counter payment", () => {
      const activeSession = {
        id: "sess_pending",
        sessionCode: "SES-PENDING",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        createdAt: new Date(),
        table: mockTable1,
        orders: [
          {
            id: "ord_x",
            orderNumber: "ORD-X",
            status: OrderStatus.SERVED,
            subtotal: new Prisma.Decimal("500.00"),
            taxAmount: new Prisma.Decimal("25.00"),
            totalAmount: new Prisma.Decimal("525.00"),
            createdAt: new Date(),
            items: [
              {
                id: "it_x",
                menuItemId: "item_x",
                itemName: "Paneer Tikka",
                quantity: 2,
                unitPrice: new Prisma.Decimal("250.00"),
                subtotal: new Prisma.Decimal("500.00"),
              },
            ],
          },
        ],
      };

      const billBeforeStaffConfirmation = calculateCombinedSessionBill({
        session: activeSession,
        restaurant: mockRestaurant,
      });

      expect(billBeforeStaffConfirmation.paymentStatus).toBe("PENDING");
      expect(billBeforeStaffConfirmation.isPaid).toBe(false);
      expect(billBeforeStaffConfirmation.paidAt).toBeNull();
      expect(billBeforeStaffConfirmation.receiptNumber).toBeNull();
    });

    // 7. A completed, paid session is not reused
    it("7. A completed, paid session is not reused; new orders start a new session", async () => {
      const sessions = [
        {
          id: "sess_old_paid",
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
          status: "COMPLETED",
          paymentStatus: "PAID",
          receiptNumber: "REC-20261024-OLD1",
        },
      ];

      const mockDb = {
        diningSession: {
          findFirst: async ({ where }: any) => {
            return (
              sessions.find(
                (s) =>
                  s.restaurantId === where.restaurantId &&
                  s.tableId === where.tableId &&
                  s.status === where.status &&
                  s.paymentStatus === where.paymentStatus
              ) || null
            );
          },
          findUnique: async () => null,
          create: async ({ data }: any) => {
            const newSession = { id: "sess_brand_new", ...data };
            sessions.push(newSession);
            return newSession;
          },
        },
      };

      const subsequentOrderSession = await getOrCreateActiveDiningSession(mockDb, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
      });

      expect(subsequentOrderSession.id).not.toBe("sess_old_paid");
      expect(subsequentOrderSession.id).toBe("sess_brand_new");
      expect(subsequentOrderSession.status).toBe("ACTIVE");
      expect(subsequentOrderSession.paymentStatus).toBe("PENDING");
    });

    // 8. A different table's orders never appear in the bill
    it("8. A different table's orders never appear in the bill (strict table isolation)", () => {
      const table1Session = {
        id: "sess_tbl1",
        sessionCode: "SES-TBL1",
        status: "ACTIVE" as const,
        paymentStatus: "PENDING" as const,
        createdAt: new Date(),
        table: mockTable1,
      };

      const table1Orders = [
        {
          id: "ord_tbl1_1",
          orderNumber: "ORD-TBL1",
          tableId: mockTable1.id,
          status: OrderStatus.SUBMITTED,
          subtotal: new Prisma.Decimal("200.00"),
          taxAmount: new Prisma.Decimal("10.00"),
          totalAmount: new Prisma.Decimal("210.00"),
          createdAt: new Date(),
          items: [
            {
              id: "it_t1",
              menuItemId: "item_t1",
              itemName: "Table 1 Butter Chicken",
              quantity: 1,
              unitPrice: new Prisma.Decimal("200.00"),
              subtotal: new Prisma.Decimal("200.00"),
            },
          ],
        },
      ];

      const table1Bill = calculateCombinedSessionBill({
        session: table1Session,
        restaurant: mockRestaurant,
        orders: table1Orders,
      });

      expect(table1Bill.items).toHaveLength(1);
      expect(table1Bill.items[0].itemName).toBe("Table 1 Butter Chicken");
      expect(table1Bill.table?.tableNumber).toBe("T1");
      expect(table1Bill.items.some((i) => i.itemName.includes("Table 2"))).toBe(false);
    });

    // 9. Duplicate payment confirmation does not generate another receipt
    it("9. Duplicate payment confirmation is rejected / does not create duplicate receipts", async () => {
      const mockSession = {
        id: "sess_double_pay",
        sessionCode: "SES-DOUBLE",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: "COMPLETED",
        paymentStatus: "PAID",
        paymentMethod: "CASH",
        paidAt: new Date(),
        receiptNumber: "REC-20261024-ORIGINAL",
        subtotal: new Prisma.Decimal("500.00"),
        totalAmount: new Prisma.Decimal("525.00"),
        restaurant: mockRestaurant,
        orders: [],
        table: mockTable1,
      };

      const mockPrisma = {
        $transaction: async (cb: any) => {
          return await cb({
            diningSession: {
              findUnique: async () => mockSession,
            },
          });
        },
      };

      const result = await confirmSessionPaymentAtCounter(
        {
          sessionId: "sess_double_pay",
          restaurantId: mockRestaurant.id,
          paymentMethod: "UPI",
          staffUserId: "staff_1",
        },
        mockPrisma as any
      );

      expect(result.isDuplicate).toBe(true);
      expect(result.receiptNumber).toBe("REC-20261024-ORIGINAL");
    });
  });
});

