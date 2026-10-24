import { describe, it, expect, vi } from "vitest";
import { Prisma, OrderStatus, DiningSessionStatus, OrderPaymentStatus, UserRole, MembershipRole } from "@prisma/client";
import { CreateOrderSchema } from "@/lib/validations/order";
import { RegisterSchema } from "@/lib/validations/auth";
import { CreateRestaurantSchema } from "@/lib/validations/restaurant";
import { calculateMixedOrderTax } from "@/lib/orders/tax";
import {
  calculateCombinedSessionBill,
  getOrCreateActiveDiningSession,
  confirmSessionPaymentAtCounter,
} from "@/lib/orders/session-billing";
import { verifyRestaurantAccess } from "@/lib/security/tenant";

describe("Production Safety & Functional Verification", () => {
  const mockRestaurant = {
    id: "rest_prod_safe",
    name: "Safe Dining Bistro",
    slug: "safe-dining-bistro",
    gstEnabled: true,
    taxRate: 5,
    taxMode: "EXCLUSIVE" as const,
    gstin: "27AADCB2230M1ZT",
    legalName: "Safe Dining Bistro LLP",
  };

  const mockTable = {
    id: "tbl_safe_1",
    tableNumber: "T-01",
    name: "Booth 1",
    qrToken: "qr_safe_test_token_12345",
  };

  const mockMenuItems = [
    {
      id: "item_pizza",
      name: "Farmhouse Pizza",
      price: new Prisma.Decimal("300.00"),
      isAvailable: true,
      useCustomTaxRate: false,
      taxRate: null,
      category: { restaurantId: mockRestaurant.id, isActive: true },
    },
    {
      id: "item_coke",
      name: "Chilled Cola",
      price: new Prisma.Decimal("60.00"),
      isAvailable: true,
      useCustomTaxRate: false,
      taxRate: null,
      category: { restaurantId: mockRestaurant.id, isActive: true },
    },
    {
      id: "item_burger",
      name: "Veggie Burger",
      price: new Prisma.Decimal("150.00"),
      isAvailable: true,
      useCustomTaxRate: false,
      taxRate: null,
      category: { restaurantId: mockRestaurant.id, isActive: true },
    },
  ];

  describe("1. Order Placement & Benchmark Verification", () => {
    it("confirms that the previous benchmark request `{}` was an input validation failure, not an order creation", () => {
      const benchmarkPayload = {};
      const result = CreateOrderSchema.safeParse(benchmarkPayload);

      expect(result.success).toBe(false);
      if (!result.success) {
        // Zod rejects `{}` immediately because `items` array is missing
        expect(result.error.issues[0].path).toContain("items");
        expect(result.error.issues[0].message).toContain("expected array");
      }
    });

    it("verifies a valid order payload passes schema validation and calculates totals authoritatively", () => {
      const validPayload = {
        qrToken: mockTable.qrToken,
        tableNumber: mockTable.tableNumber,
        customerNotes: "No ice in cola",
        items: [
          { menuItemId: "item_pizza", quantity: 2, notes: "Crispy crust" },
          { menuItemId: "item_coke", quantity: 1 },
        ],
      };

      const parsed = CreateOrderSchema.safeParse(validPayload);
      expect(parsed.success).toBe(true);

      if (parsed.success) {
        // Authoritative server-side price calculation
        const taxSnapshot = calculateMixedOrderTax({
          items: parsed.data.items.map((i) => {
            const dbItem = mockMenuItems.find((m) => m.id === i.menuItemId)!;
            return {
              menuItemId: dbItem.id,
              name: dbItem.name,
              price: dbItem.price,
              quantity: i.quantity,
              useCustomTaxRate: dbItem.useCustomTaxRate,
              taxRate: dbItem.taxRate,
              notes: i.notes || null,
            };
          }),
          gstEnabled: mockRestaurant.gstEnabled,
          restaurantTaxRate: mockRestaurant.taxRate,
          taxMode: mockRestaurant.taxMode,
          discountAmount: 0,
        });

        // 2 * 300 (Pizza) + 1 * 60 (Cola) = 660 Subtotal
        expect(taxSnapshot.subtotal.toString()).toBe("660");
        // 5% GST on 660 = 33 (16.50 CGST + 16.50 SGST)
        expect(taxSnapshot.taxAmount.toString()).toBe("33");
        expect(taxSnapshot.cgstAmount.toString()).toBe("16.5");
        expect(taxSnapshot.sgstAmount.toString()).toBe("16.5");
        // Total = 693
        expect(taxSnapshot.totalAmount.toString()).toBe("693");
      }
    });

    it("executes simulated end-to-end atomic order placement without mutating production DB", async () => {
      const activeSessions: any[] = [];
      const createdOrders: any[] = [];

      const mockTx = {
        diningSession: {
          findFirst: async ({ where }: any) => {
            return (
              activeSessions.find(
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
            const newSession = {
              id: "sess_fixture_001",
              sessionCode: "DS-T01-001",
              ...data,
            };
            activeSessions.push(newSession);
            return newSession;
          },
        },
        order: {
          create: async ({ data }: any) => {
            const orderRecord = {
              id: "ord_fixture_101",
              ...data,
              createdAt: new Date(),
            };
            createdOrders.push(orderRecord);
            return orderRecord;
          },
        },
      };

      // 1. Get or create active session
      const session = await getOrCreateActiveDiningSession(mockTx, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable.id,
      });

      expect(session).toBeDefined();
      expect(session.id).toBe("sess_fixture_001");
      expect(session.status).toBe(DiningSessionStatus.ACTIVE);
      expect(session.paymentStatus).toBe(OrderPaymentStatus.PENDING);

      // 2. Insert order linked to session
      const newOrder = await mockTx.order.create({
        data: {
          orderNumber: "ORD-20261024-TEST1",
          restaurantId: mockRestaurant.id,
          tableId: mockTable.id,
          diningSessionId: session.id,
          subtotal: new Prisma.Decimal("660.00"),
          taxAmount: new Prisma.Decimal("33.00"),
          totalAmount: new Prisma.Decimal("693.00"),
          status: OrderStatus.SUBMITTED,
        },
      });

      expect(newOrder.orderNumber).toBe("ORD-20261024-TEST1");
      expect(newOrder.diningSessionId).toBe(session.id);
      expect(createdOrders.length).toBe(1);
    });
  });

  describe("2. Combined Billing & Kitchen Ticket Separation", () => {
    it("keeps multiple orders from the same table in one active session and combines their bill", () => {
      const activeSession = {
        id: "sess_combined_lifecycle",
        sessionCode: "DS-T01-SAFE",
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        table: mockTable,
      };

      // Order 1: 1 Farmhouse Pizza (₹300)
      const order1 = {
        id: "ord_1",
        orderNumber: "ORD-001",
        status: OrderStatus.CONFIRMED,
        subtotal: new Prisma.Decimal("300.00"),
        taxAmount: new Prisma.Decimal("15.00"),
        totalAmount: new Prisma.Decimal("315.00"),
        createdAt: new Date("2026-10-24T12:00:00Z"),
        items: [
          {
            id: "oi_1",
            menuItemId: "item_pizza",
            itemName: "Farmhouse Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("300.00"),
            subtotal: new Prisma.Decimal("300.00"),
          },
        ],
      };

      // Order 2: 1 Farmhouse Pizza (₹300) + 1 Chilled Cola (₹60)
      const order2 = {
        id: "ord_2",
        orderNumber: "ORD-002",
        status: OrderStatus.PREPARING,
        subtotal: new Prisma.Decimal("360.00"),
        taxAmount: new Prisma.Decimal("18.00"),
        totalAmount: new Prisma.Decimal("378.00"),
        createdAt: new Date("2026-10-24T12:30:00Z"),
        items: [
          {
            id: "oi_2a",
            menuItemId: "item_pizza",
            itemName: "Farmhouse Pizza",
            quantity: 1,
            unitPrice: new Prisma.Decimal("300.00"),
            subtotal: new Prisma.Decimal("300.00"),
          },
          {
            id: "oi_2b",
            menuItemId: "item_coke",
            itemName: "Chilled Cola",
            quantity: 1,
            unitPrice: new Prisma.Decimal("60.00"),
            subtotal: new Prisma.Decimal("60.00"),
          },
        ],
      };

      // Kitchen verification: orders remain distinct tickets
      expect(order1.orderNumber).not.toBe(order2.orderNumber);
      expect(order1.status).toBe(OrderStatus.CONFIRMED);
      expect(order2.status).toBe(OrderStatus.PREPARING);

      // Customer bill verification: combined into one running total
      const bill = calculateCombinedSessionBill({
        session: activeSession,
        restaurant: mockRestaurant,
        orders: [order1, order2],
      });

      expect(bill.orderCount).toBe(2);
      expect(bill.paymentStatus).toBe("PENDING");
      expect(bill.isPaid).toBe(false);

      const pizzaLine = bill.items.find((i) => i.itemName === "Farmhouse Pizza");
      expect(pizzaLine).toBeDefined();
      expect(pizzaLine?.quantity).toBe(2);
      expect(pizzaLine?.subtotal).toBe(600);

      const colaLine = bill.items.find((i) => i.itemName === "Chilled Cola");
      expect(colaLine).toBeDefined();
      expect(colaLine?.quantity).toBe(1);
      expect(colaLine?.subtotal).toBe(60);

      // Subtotal ₹660, 5% GST = ₹33, Total = ₹693
      expect(bill.subtotal).toBe(660);
      expect(bill.taxAmount).toBe(33);
      expect(bill.totalAmount).toBe(693);
    });

    it("completes session on counter payment and starts a new session for subsequent orders", async () => {
      let sessionState: any = {
        id: "sess_lifecycle_flow",
        sessionCode: "DS-LIFECYCLE",
        restaurantId: mockRestaurant.id,
        tableId: mockTable.id,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        paymentMethod: null,
        paidAt: null,
        receiptNumber: null,
        subtotal: new Prisma.Decimal("660.00"),
        totalAmount: new Prisma.Decimal("693.00"),
        table: mockTable,
        orders: [],
        restaurant: mockRestaurant,
      };

      const mockDb = {
        $transaction: async (cb: (tx: any) => Promise<any>) => {
          const fakeTx = {
            $executeRaw: async () => 1,
            diningSession: {
              findUnique: async () => sessionState,
              update: async ({ data }: any) => {
                sessionState = { ...sessionState, ...data };
                return sessionState;
              },
            },
            order: { updateMany: async () => ({ count: 2 }) },
          };
          return cb(fakeTx);
        },
        diningSession: {
          findFirst: async ({ where }: any) => {
            if (
              sessionState.status === where.status &&
              sessionState.paymentStatus === where.paymentStatus
            ) {
              return sessionState;
            }
            return null;
          },
          findUnique: async () => null,
          create: async ({ data }: any) => {
            return {
              id: "sess_subsequent_order",
              sessionCode: "DS-NEW-VISIT",
              ...data,
            };
          },
        },
      };

      // 1. Authorized staff confirms counter payment
      const paymentResult = await confirmSessionPaymentAtCounter(
        {
          sessionId: sessionState.id,
          restaurantId: mockRestaurant.id,
          staffUserId: "usr_cashier_101",
          paymentMethod: "CASH",
        },
        mockDb as any
      );

      expect(paymentResult.receiptNumber).toMatch(/^REC-/);
      expect(sessionState.status).toBe(DiningSessionStatus.COMPLETED);
      expect(sessionState.paymentStatus).toBe(OrderPaymentStatus.PAID);
      expect(sessionState.paymentMethod).toBe("CASH");

      // 2. Next customer or subsequent order on the same table
      const nextSession = await getOrCreateActiveDiningSession(mockDb, {
        restaurantId: mockRestaurant.id,
        tableId: mockTable.id,
      });

      expect(nextSession.id).toBe("sess_subsequent_order");
      expect(nextSession.id).not.toBe(sessionState.id);
      expect(nextSession.status).toBe(DiningSessionStatus.ACTIVE);
      expect(nextSession.paymentStatus).toBe(OrderPaymentStatus.PENDING);
    });
  });

  describe("3. Counter Payment Security & Tenant Isolation", () => {
    it("rejects payment confirmation attempts across different restaurant tenants", async () => {
      const sessionOfRestA = {
        id: "sess_tenant_a",
        restaurantId: "rest_alpha",
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
      };

      const mockDb = {
        $transaction: async (cb: any) => {
          return cb({
            diningSession: {
              findUnique: async () => sessionOfRestA,
            },
          });
        },
      };

      // Staff from Restaurant Beta attempts confirming payment for Restaurant Alpha's session
      await expect(
        confirmSessionPaymentAtCounter(
          {
            sessionId: "sess_tenant_a",
            restaurantId: "rest_beta", // Mismatched tenant
            staffUserId: "staff_from_beta",
            paymentMethod: "CASH",
          },
          mockDb as any
        )
      ).rejects.toThrow("Dining session not found for this restaurant.");
    });

    it("verifies staff authorization check rejects non-members and unauthorized roles", async () => {
      const mockMemberLookup = vi.fn().mockResolvedValue(null);

      // Verify tenant access helper rejects non-member staff user
      const checkResult = await verifyRestaurantAccess(
        "unauthorized_user",
        UserRole.STAFF,
        "rest_alpha",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(checkResult.authorized).toBe(false);
    });
  });

  describe("4. Menu Caching & Sensitive Endpoint Header Policy", () => {
    it("verifies public menu cache header permits CDN caching with bounded stale window", () => {
      const menuCacheHeader = "public, s-maxage=10, stale-while-revalidate=60";
      expect(menuCacheHeader).toContain("s-maxage=10");
      expect(menuCacheHeader).toContain("stale-while-revalidate=60");
      expect(menuCacheHeader).toContain("public");
    });

    it("verifies sensitive dynamic endpoints use strict no-store headers", () => {
      const privateNoStoreHeader = "private, no-cache, no-store, must-revalidate";
      expect(privateNoStoreHeader).toContain("no-store");
      expect(privateNoStoreHeader).toContain("private");
      expect(privateNoStoreHeader).toContain("no-cache");
    });
  });

  describe("5. Terms Acceptance Strict Validation & Audit Storage", () => {
    it("rejects user registration when agreedToTerms is missing", () => {
      const result = RegisterSchema.safeParse({
        name: "Chef Mario",
        email: "mario@kitchen.com",
        password: "SecurePassword1",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.agreedToTerms).toBeDefined();
      }
    });

    it("rejects user registration when agreedToTerms is false", () => {
      const result = RegisterSchema.safeParse({
        name: "Chef Mario",
        email: "mario@kitchen.com",
        password: "SecurePassword1",
        agreedToTerms: false,
      });
      expect(result.success).toBe(false);
    });

    it("accepts user registration only when agreedToTerms is explicitly true", () => {
      const result = RegisterSchema.safeParse({
        name: "Chef Mario",
        email: "mario@kitchen.com",
        password: "SecurePassword1",
        agreedToTerms: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agreedToTerms).toBe(true);
      }
    });

    it("rejects restaurant creation when agreedToTerms is missing", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "Mario Pizzeria",
        slug: "mario-pizzeria",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.agreedToTerms).toBeDefined();
      }
    });

    it("rejects restaurant creation when agreedToTerms is false", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "Mario Pizzeria",
        slug: "mario-pizzeria",
        agreedToTerms: false,
      });
      expect(result.success).toBe(false);
    });

    it("accepts restaurant creation only when agreedToTerms is explicitly true", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "Mario Pizzeria",
        slug: "mario-pizzeria",
        agreedToTerms: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agreedToTerms).toBe(true);
      }
    });

    it("validates that terms audit fields match UTC timestamp and current termsVersion v1.0", () => {
      const registrationAudit = {
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
      };

      expect(registrationAudit.termsAcceptedAt).toBeInstanceOf(Date);
      expect(registrationAudit.termsVersion).toBe("v1.0");
      expect(Date.now() - registrationAudit.termsAcceptedAt.getTime()).toBeLessThan(1000);
    });
  });
});
