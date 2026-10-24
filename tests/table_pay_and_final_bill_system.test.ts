import { describe, it, expect, vi } from "vitest";
import { Prisma, OrderStatus, DiningSessionStatus, OrderPaymentStatus } from "@prisma/client";
import {
  calculateCombinedSessionBill,
  requestFinalTableBill,
  reopenTableBill,
  confirmSessionPaymentAtCounter,
  getOrCreateActiveDiningSession,
} from "@/lib/orders/session-billing";

describe("Pay & Get Final Bill System", () => {
  const mockRestaurant = {
    id: "rest_cafe_delight",
    name: "Cafe Delight",
    slug: "cafe-delight",
    gstEnabled: true,
    taxRate: 5,
    taxMode: "EXCLUSIVE" as const,
    gstin: "27AAACR1234M1Z5",
    legalName: "Cafe Delight Food Ventures Pvt Ltd",
  };

  const mockTable1 = {
    id: "tbl_table_1",
    tableNumber: "T1",
    name: "Corner Booth",
    qrToken: "qr_table_1_secret",
  };

  const mockTable2 = {
    id: "tbl_table_2",
    tableNumber: "T2",
    name: "Window Seat",
    qrToken: "qr_table_2_secret",
  };

  const order1 = {
    id: "ord_001",
    orderNumber: "ORD-20261024-001",
    restaurantId: mockRestaurant.id,
    tableId: mockTable1.id,
    status: OrderStatus.SUBMITTED,
    subtotal: new Prisma.Decimal("400.00"),
    discountAmount: new Prisma.Decimal("0.00"),
    couponCode: null,
    taxRate: new Prisma.Decimal("5.00"),
    taxAmount: new Prisma.Decimal("20.00"),
    taxMode: "EXCLUSIVE",
    taxableAmount: new Prisma.Decimal("400.00"),
    cgstAmount: new Prisma.Decimal("10.00"),
    sgstAmount: new Prisma.Decimal("10.00"),
    totalAmount: new Prisma.Decimal("420.00"),
    customerNotes: "Extra spicy",
    createdAt: new Date("2026-10-24T12:00:00Z"),
    items: [
      {
        id: "item_1",
        orderId: "ord_001",
        menuItemId: "menu_pizza",
        itemName: "Farmhouse Pizza",
        quantity: 2,
        unitPrice: new Prisma.Decimal("200.00"),
        subtotal: new Prisma.Decimal("400.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("20.00"),
        taxableAmount: new Prisma.Decimal("400.00"),
        notes: null,
      },
    ],
  };

  const order2 = {
    id: "ord_002",
    orderNumber: "ORD-20261024-002",
    restaurantId: mockRestaurant.id,
    tableId: mockTable1.id,
    status: OrderStatus.CONFIRMED,
    subtotal: new Prisma.Decimal("100.00"),
    discountAmount: new Prisma.Decimal("0.00"),
    couponCode: null,
    taxRate: new Prisma.Decimal("5.00"),
    taxAmount: new Prisma.Decimal("5.00"),
    taxMode: "EXCLUSIVE",
    taxableAmount: new Prisma.Decimal("100.00"),
    cgstAmount: new Prisma.Decimal("2.50"),
    sgstAmount: new Prisma.Decimal("2.50"),
    totalAmount: new Prisma.Decimal("105.00"),
    customerNotes: "Chilled",
    createdAt: new Date("2026-10-24T12:30:00Z"),
    items: [
      {
        id: "item_2",
        orderId: "ord_002",
        menuItemId: "menu_coke",
        itemName: "Cold Drink",
        quantity: 2,
        unitPrice: new Prisma.Decimal("50.00"),
        subtotal: new Prisma.Decimal("100.00"),
        taxRate: new Prisma.Decimal("5.00"),
        taxAmount: new Prisma.Decimal("5.00"),
        taxableAmount: new Prisma.Decimal("100.00"),
        notes: "Chilled",
      },
    ],
  };

  describe("1. Customer Final Bill Request & Authoritative Totals Calculation", () => {
    it("combines multiple orders in one session with authoritative subtotal and GST breakdown", () => {
      const activeSession = {
        id: "session_100",
        sessionCode: "DS-20261024-T1-ABC",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1, order2],
        createdAt: new Date("2026-10-24T12:00:00Z"),
      };

      const bill = calculateCombinedSessionBill({
        session: activeSession,
        restaurant: mockRestaurant,
      });

      // Subtotal: 400 + 100 = 500
      expect(bill.subtotal).toBe(500);
      // GST: 5% of 500 = 25 (CGST 12.50 + SGST 12.50)
      expect(bill.taxAmount).toBe(25);
      expect(bill.cgstAmount).toBe(12.5);
      expect(bill.sgstAmount).toBe(12.5);
      // Total amount: 500 + 25 = 525
      expect(bill.totalAmount).toBe(525);
      expect(bill.orderCount).toBe(2);
      expect(bill.orderNumbers).toEqual(["ORD-20261024-001", "ORD-20261024-002"]);
      expect(bill.items).toHaveLength(2);
      expect(bill.paymentStatus).toBe("PENDING");
      expect(bill.isPaid).toBe(false);
      expect(bill.isPaymentRequested).toBe(false);
    });

    it("correctly includes item-level GST overrides and proportional discounts in combined bill", () => {
      const discountedOrder = {
        id: "ord_003",
        orderNumber: "ORD-20261024-003",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: OrderStatus.SERVED,
        subtotal: new Prisma.Decimal("500.00"),
        discountAmount: new Prisma.Decimal("50.00"),
        couponCode: "SAVE10",
        taxRate: new Prisma.Decimal("18.00"), // Item-level override: 18% GST
        taxAmount: new Prisma.Decimal("81.00"),
        taxMode: "EXCLUSIVE",
        taxableAmount: new Prisma.Decimal("450.00"),
        cgstAmount: new Prisma.Decimal("40.50"),
        sgstAmount: new Prisma.Decimal("40.50"),
        totalAmount: new Prisma.Decimal("531.00"),
        customerNotes: null,
        createdAt: new Date("2026-10-24T12:45:00Z"),
        items: [
          {
            id: "item_3",
            orderId: "ord_003",
            menuItemId: "menu_dessert",
            itemName: "Tiramisu Gelato",
            quantity: 1,
            unitPrice: new Prisma.Decimal("500.00"),
            subtotal: new Prisma.Decimal("500.00"),
            taxRate: new Prisma.Decimal("18.00"),
            taxAmount: new Prisma.Decimal("81.00"),
            taxableAmount: new Prisma.Decimal("450.00"),
            notes: null,
          },
        ],
      };

      const sessionWithDiscount = {
        id: "session_101",
        sessionCode: "DS-20261024-T1-XYZ",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1, discountedOrder],
        createdAt: new Date("2026-10-24T12:00:00Z"),
      };

      const bill = calculateCombinedSessionBill({
        session: sessionWithDiscount,
        restaurant: mockRestaurant,
      });

      // Subtotal: 400 + 500 = 900
      expect(bill.subtotal).toBe(900);
      // Discount: 50
      expect(bill.discountAmount).toBe(50);
      // Proportional discount GST calculation:
      expect(bill.taxAmount).toBe(103.89);
      expect(bill.totalAmount).toBe(953.89);
    });
  });

  describe("2. Request Final Bill Lifecycle & Session Lock", () => {
    it("requestFinalTableBill transitions session to PAYMENT_REQUESTED and sets billRequestedAt", async () => {
      const mockSession = {
        id: "session_200",
        sessionCode: "DS-20261024-T1-200",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1],
        createdAt: new Date("2026-10-24T12:00:00Z"),
        billRequestedAt: null,
        restaurant: mockRestaurant,
      };

      const updatedSession = {
        ...mockSession,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        billRequestedAt: new Date("2026-10-24T12:40:00Z"),
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            $queryRaw: vi.fn().mockResolvedValue([{ id: mockSession.id }]),
            diningSession: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
              findUnique: vi.fn().mockResolvedValue(mockSession),
              update: vi.fn().mockResolvedValue(updatedSession),
            },
            restaurant: {
              findUnique: vi.fn().mockResolvedValue(mockRestaurant),
            },
            serviceRequest: {
              create: vi.fn().mockResolvedValue({ id: "req_1" }),
            },
          });
        }),
      };

      const result = await requestFinalTableBill(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
        },
        mockPrisma as any
      );

      expect(result.success).toBe(true);
      expect(result.bill.sessionStatus).toBe(DiningSessionStatus.PAYMENT_REQUESTED);
      expect(result.bill.isPaymentRequested).toBe(true);
      expect(result.bill.paymentStatus).toBe("PENDING");
      expect(result.isAlreadyRequested).toBe(false);
    });

    it("requestFinalTableBill is idempotent and does not error on duplicate requests", async () => {
      const alreadyRequestedSession = {
        id: "session_200",
        sessionCode: "DS-20261024-T1-200",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1],
        createdAt: new Date("2026-10-24T12:00:00Z"),
        billRequestedAt: new Date("2026-10-24T12:40:00Z"),
        restaurant: mockRestaurant,
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            $queryRaw: vi.fn().mockResolvedValue([{ id: alreadyRequestedSession.id }]),
            diningSession: {
              findFirst: vi.fn().mockResolvedValue(alreadyRequestedSession),
              findUnique: vi.fn().mockResolvedValue(alreadyRequestedSession),
              update: vi.fn(),
            },
            restaurant: {
              findUnique: vi.fn().mockResolvedValue(mockRestaurant),
            },
            serviceRequest: {
              create: vi.fn(),
            },
          });
        }),
      };

      const result = await requestFinalTableBill(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
        },
        mockPrisma as any
      );

      expect(result.isAlreadyRequested).toBe(true);
      expect(result.bill.isPaymentRequested).toBe(true);
    });

    it("does NOT complete the session or mark it PAID merely because customer requested bill", async () => {
      const mockSession = {
        id: "session_201",
        sessionCode: "DS-20261024-T1-201",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1],
        createdAt: new Date("2026-10-24T12:00:00Z"),
        billRequestedAt: null,
        restaurant: mockRestaurant,
      };

      const updatedSession = {
        ...mockSession,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        billRequestedAt: new Date(),
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            $queryRaw: vi.fn().mockResolvedValue([{ id: mockSession.id }]),
            diningSession: {
              findFirst: vi.fn().mockResolvedValue(mockSession),
              findUnique: vi.fn().mockResolvedValue(mockSession),
              update: vi.fn().mockResolvedValue(updatedSession),
            },
            restaurant: {
              findUnique: vi.fn().mockResolvedValue(mockRestaurant),
            },
            serviceRequest: {
              create: vi.fn(),
            },
          });
        }),
      };

      const result = await requestFinalTableBill(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
        },
        mockPrisma as any
      );

      // Session MUST NOT be COMPLETED or PAID
      expect(result.bill.sessionStatus).not.toBe(DiningSessionStatus.COMPLETED);
      expect(result.bill.paymentStatus).toBe(OrderPaymentStatus.PENDING);
      expect(result.bill.receiptNumber).toBeNull();
      expect(result.bill.isPaid).toBe(false);
    });
  });

  describe("3. Bill Lock Protection Against Order Mutations", () => {
    it("blocks new order submission with BILL_LOCKED when table session is in PAYMENT_REQUESTED", async () => {
      const lockedSession = {
        id: "session_locked",
        sessionCode: "DS-20261024-T1-LOCK",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        paymentStatus: OrderPaymentStatus.PENDING,
      };

      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: mockTable1.id }]),
        table: {
          findUnique: vi.fn().mockResolvedValue(mockTable1),
        },
        diningSession: {
          findFirst: vi.fn().mockResolvedValue(lockedSession),
          findUnique: vi.fn().mockResolvedValue(lockedSession),
        },
      };

      await expect(
        getOrCreateActiveDiningSession(
          mockTx as any,
          {
            restaurantId: mockRestaurant.id,
            tableId: mockTable1.id,
          }
        )
      ).rejects.toThrow("BILL_LOCKED");
    });

    it("reopening the bill transitions session back to ACTIVE and allows new orders again", async () => {
      const lockedSession = {
        id: "session_locked",
        sessionCode: "DS-20261024-T1-LOCK",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1],
        billRequestedAt: new Date("2026-10-24T12:40:00Z"),
      };

      const reopenedSession = {
        ...lockedSession,
        status: DiningSessionStatus.ACTIVE,
        billRequestedAt: null,
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            $queryRaw: vi.fn().mockResolvedValue([{ id: lockedSession.id }]),
            diningSession: {
              findFirst: vi.fn().mockResolvedValue(lockedSession),
              findUnique: vi.fn().mockResolvedValue(lockedSession),
              update: vi.fn().mockResolvedValue(reopenedSession),
            },
            restaurant: {
              findUnique: vi.fn().mockResolvedValue(mockRestaurant),
            },
          });
        }),
      };

      const result = await reopenTableBill(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
          sessionId: lockedSession.id,
        },
        mockPrisma as any
      );

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(DiningSessionStatus.ACTIVE);
      expect(result.data.billRequestedAt).toBeNull();
    });
  });

  describe("4. Staff Counter Payment Confirmation & Single Final Receipt", () => {
    it("confirms payment for session in PAYMENT_REQUESTED status, marking it COMPLETED and PAID", async () => {
      const paymentRequestedSession = {
        id: "session_settle",
        sessionCode: "DS-20261024-T1-SETTLE",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        paymentStatus: OrderPaymentStatus.PENDING,
        table: mockTable1,
        orders: [order1, order2],
        billRequestedAt: new Date("2026-10-24T12:40:00Z"),
        restaurant: mockRestaurant,
      };

      const mockTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        diningSession: {
          findFirst: vi.fn().mockResolvedValue(paymentRequestedSession),
          findUnique: vi.fn().mockResolvedValue(paymentRequestedSession),
          update: vi.fn().mockImplementation(({ data }) => ({
            ...paymentRequestedSession,
            ...data,
          })),
        },
        restaurant: {
          findUnique: vi.fn().mockResolvedValue(mockRestaurant),
        },
        order: {
          updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
      };

      const confirmation = await confirmSessionPaymentAtCounter(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
          sessionId: paymentRequestedSession.id,
          paymentMethod: "UPI",
          notes: "GPay counter scan",
        },
        mockPrisma as any
      );

      expect(confirmation.success).toBe(true);
      expect(confirmation.isDuplicate).toBe(false);
      expect(confirmation.receiptNumber).toMatch(/^REC-/);
      expect(confirmation.bill.paymentStatus).toBe(OrderPaymentStatus.PAID);
      expect(confirmation.bill.isPaid).toBe(true);
      expect(confirmation.paymentMethod).toBe("UPI");
    });

    it("payment confirmation is idempotent and does not charge or re-receipt an already paid bill", async () => {
      const alreadyPaidSession = {
        id: "session_already_paid",
        sessionCode: "DS-20261024-T1-PAID",
        restaurantId: mockRestaurant.id,
        tableId: mockTable1.id,
        status: DiningSessionStatus.COMPLETED,
        paymentStatus: OrderPaymentStatus.PAID,
        paymentMethod: "CASH",
        receiptNumber: "REC-20261024-T1-9999",
        paidAt: new Date("2026-10-24T12:50:00Z"),
        updatedAt: new Date("2026-10-24T12:50:00Z"),
        totalAmount: new Prisma.Decimal("525.00"),
        table: mockTable1,
        orders: [order1, order2],
        restaurant: mockRestaurant,
      };

      const mockTx = {
        $executeRaw: vi.fn().mockResolvedValue(1),
        diningSession: {
          findFirst: vi.fn().mockResolvedValue(alreadyPaidSession),
          findUnique: vi.fn().mockResolvedValue(alreadyPaidSession),
          update: vi.fn(),
        },
        restaurant: {
          findUnique: vi.fn().mockResolvedValue(mockRestaurant),
        },
        order: {
          updateMany: vi.fn(),
        },
      };

      const mockPrisma = {
        $transaction: vi.fn(async (cb) => cb(mockTx)),
      };

      const confirmation = await confirmSessionPaymentAtCounter(
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
          sessionId: alreadyPaidSession.id,
          paymentMethod: "CARD",
        },
        mockPrisma as any
      );

      expect(confirmation.isDuplicate).toBe(true);
      expect(confirmation.receiptNumber).toBe("REC-20261024-T1-9999");
      expect(confirmation.paymentMethod).toBe("CASH"); // Remains original method
      expect(mockTx.diningSession.update).not.toHaveBeenCalled();
    });
  });

  describe("5. Next Session Isolation & Clean Lifecycle", () => {
    it("after previous session is completed and paid, a new order creates a fresh active session", async () => {
      const mockTx = {
        $queryRaw: vi.fn().mockResolvedValue([{ id: mockTable1.id }]),
        table: {
          findUnique: vi.fn().mockResolvedValue(mockTable1),
        },
        diningSession: {
          findFirst: vi.fn().mockResolvedValue(null), // No active or payment_requested session
          findUnique: vi.fn().mockResolvedValue(null), // No conflict on sessionCode
          create: vi.fn().mockImplementation(({ data }) => ({
            id: "session_fresh_300",
            ...data,
            status: DiningSessionStatus.ACTIVE,
            paymentStatus: OrderPaymentStatus.PENDING,
          })),
        },
      };

      const nextSession = await getOrCreateActiveDiningSession(
        mockTx as any,
        {
          restaurantId: mockRestaurant.id,
          tableId: mockTable1.id,
        }
      );

      expect(nextSession.id).toBe("session_fresh_300");
      expect(nextSession.status).toBe(DiningSessionStatus.ACTIVE);
      expect(nextSession.paymentStatus).toBe(OrderPaymentStatus.PENDING);
      expect(nextSession.tableId).toBe(mockTable1.id);
    });
  });

  describe("6. Cross-Table and Tenant Isolation Security", () => {
    it("rejects bill request if table belongs to a different restaurant", async () => {
      const mockPrisma = {
        $transaction: vi.fn(async (cb) => {
          return cb({
            $queryRaw: vi.fn().mockResolvedValue([]),
            diningSession: {
              findFirst: vi.fn().mockResolvedValue(null), // Cannot find across tenant
              findUnique: vi.fn().mockResolvedValue(null),
            },
          });
        }),
      };

      await expect(
        requestFinalTableBill(
          {
            restaurantId: mockRestaurant.id, // Current restaurant
            tableId: mockTable2.id, // Table from different context
          },
          mockPrisma as any
        )
      ).rejects.toThrow("No active dining session found");
    });
  });
});
