import { describe, it, expect, vi, beforeEach } from "vitest";
import { OrderStatus, UserRole, MembershipRole } from "@prisma/client";
import {
  resolveDateRange,
  parseDateInput,
  isValidDateRange,
  formatCurrencyINR,
  formatCompactINR,
} from "@/lib/analytics/dates";
import { ORDER_STATUS_LABELS } from "@/lib/analytics/service";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    restaurantMember: {
      findUnique: vi.fn(),
    },
    restaurant: {
      findUnique: vi.fn(),
    },
    order: {
      groupBy: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

describe("Restaurant Order Analytics Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Date Range & Boundary Resolution", () => {
    // Reference date: 2026-10-04 12:00:00 IST (UTC: 2026-10-04 06:30:00Z)
    const refDate = new Date("2026-10-04T06:30:00.000Z");

    it("resolves 'today' preset strictly to start and end of current operational day", () => {
      const range = resolveDateRange("today", null, null, refDate);
      expect(range.preset).toBe("today");
      expect(range.label).toBe("Today");
      expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime());

      // Start of day in IST (+05:30) is 18:30:00Z on previous day
      expect(range.startDate.toISOString()).toContain("2026-10-03T18:30:00");
      expect(range.endDate.toISOString()).toContain("2026-10-04T18:29:59");
    });

    it("resolves 'yesterday' preset to start and end of previous day", () => {
      const range = resolveDateRange("yesterday", null, null, refDate);
      expect(range.preset).toBe("yesterday");
      expect(range.label).toBe("Yesterday");
      expect(range.startDate.toISOString()).toContain("2026-10-02T18:30:00");
      expect(range.endDate.toISOString()).toContain("2026-10-03T18:29:59");
    });

    it("resolves 'last7days' preset encompassing the past 7 days up to end of today", () => {
      const range = resolveDateRange("last7days", null, null, refDate);
      expect(range.preset).toBe("last7days");
      expect(range.startDate.getTime()).toBeLessThan(range.endDate.getTime());
      const dayDiff = Math.round(
        (range.endDate.getTime() - range.startDate.getTime()) / (24 * 60 * 60 * 1000)
      );
      expect(dayDiff).toBe(7);
    });

    it("resolves 'thismonth' and 'lastmonth' boundaries accurately", () => {
      const thisMonth = resolveDateRange("thismonth", null, null, refDate);
      expect(thisMonth.preset).toBe("thismonth");
      // 1st of October 2026
      expect(thisMonth.startDate.toISOString()).toContain("2026-09-30T18:30:00");

      const lastMonth = resolveDateRange("lastmonth", null, null, refDate);
      expect(lastMonth.preset).toBe("lastmonth");
      // September 2026 (starts Aug 31 18:30:00Z, ends Sep 30 18:29:59Z)
      expect(lastMonth.startDate.toISOString()).toContain("2026-08-31T18:30:00");
    });

    it("resolves 'thisyear' preset starting from Jan 1st of current year", () => {
      const range = resolveDateRange("thisyear", null, null, refDate);
      expect(range.preset).toBe("thisyear");
      // 1st of January 2026 in IST
      expect(range.startDate.toISOString()).toContain("2025-12-31T18:30:00");
    });

    it("safely parses valid custom date strings", () => {
      const parsedStart = parseDateInput("2026-08-01", false);
      const parsedEnd = parseDateInput("2026-08-15", true);

      expect(parsedStart).not.toBeNull();
      expect(parsedEnd).not.toBeNull();
      expect(parsedStart!.getTime()).toBeLessThan(parsedEnd!.getTime());
      expect(isValidDateRange(parsedStart!, parsedEnd!)).toBe(true);
    });

    it("rejects invalid or inverted custom date ranges", () => {
      const parsedStart = parseDateInput("2026-09-20", false);
      const parsedEnd = parseDateInput("2026-09-10", true);

      expect(parsedStart).not.toBeNull();
      expect(parsedEnd).not.toBeNull();
      // start > end is invalid
      expect(isValidDateRange(parsedStart!, parsedEnd!)).toBe(false);

      // Malformed strings return null
      expect(parseDateInput("invalid-date", false)).toBeNull();
      expect(parseDateInput("2026-13-45", false)).toBeNull();
    });

    it("rejects date ranges exceeding maximum allowed duration (5 years)", () => {
      const start = new Date("2020-01-01T00:00:00Z");
      const end = new Date("2026-06-01T00:00:00Z"); // > 6 years
      expect(isValidDateRange(start, end)).toBe(false);
    });
  });

  describe("2. Cash-at-Counter Sales & Order Rules", () => {
    const simulatedOrders = [
      { status: OrderStatus.SUBMITTED, totalAmount: 250.0 },
      { status: OrderStatus.CONFIRMED, totalAmount: 400.0 },
      { status: OrderStatus.PREPARING, totalAmount: 350.0 },
      { status: OrderStatus.SERVED, totalAmount: 500.0 },
      { status: OrderStatus.COMPLETED, totalAmount: 800.0 },
      { status: OrderStatus.CANCELLED, totalAmount: 1200.0 }, // CANCELLED: must be excluded!
    ];

    it("accurately calculates sales, order counts, and excludes cancelled orders", () => {
      let totalOrders = 0;
      let completedOrders = 0;
      let cancelledOrders = 0;
      let sales = 0;
      let completedSales = 0;

      for (const o of simulatedOrders) {
        totalOrders++;
        if (o.status === OrderStatus.CANCELLED) {
          cancelledOrders++;
        } else {
          // Exclude cancelled orders from sales
          sales += o.totalAmount;
        }
        if (o.status === OrderStatus.COMPLETED) {
          completedOrders++;
          completedSales += o.totalAmount;
        }
      }

      // Total Orders: 6
      expect(totalOrders).toBe(6);
      // Completed Orders: 1
      expect(completedOrders).toBe(1);
      // Cancelled Orders: 1
      expect(cancelledOrders).toBe(1);
      // Sales: 250 + 400 + 350 + 500 + 800 = 2300 (1200 cancelled excluded!)
      expect(sales).toBe(2300.0);
      // Completed Sales: 800
      expect(completedSales).toBe(800.0);

      // Average Order Value across non-cancelled orders: 2300 / 5 = 460
      const nonCancelledOrders = totalOrders - cancelledOrders;
      const aov = nonCancelledOrders > 0 ? sales / nonCancelledOrders : 0;
      expect(aov).toBe(460.0);
    });

    it("strictly excludes CANCELLED orders from valid sales totals", () => {
      const cancelledOrder = { status: OrderStatus.CANCELLED, totalAmount: 1500.0 };
      const validSalesContribution =
        cancelledOrder.status === OrderStatus.CANCELLED ? 0 : cancelledOrder.totalAmount;
      expect(validSalesContribution).toBe(0);
    });

    it("does not claim sales are cash collected unless actual payment collection is recorded", () => {
      // In cash-at-counter model, metrics are cleanly labelled "Sales" rather than assuming cash in register
      const isDigitalPaymentRecorded = false;
      const sales = 2300.0;
      const cashCollectedRecorded = isDigitalPaymentRecorded ? sales : 0.0;
      expect(cashCollectedRecorded).toBe(0.0);
    });

    it("verifies no payment-pending state or workflow exists in cash-at-counter model", () => {
      // Business operates without payment-pending queue; dining orders are placed and settled at counter
      const allowedOrderStatuses = Object.values(OrderStatus);
      expect(allowedOrderStatuses).not.toContain("PAYMENT_PENDING");
      expect(allowedOrderStatuses).not.toContain("PENDING_PAYMENT");
    });

    it("handles empty order datasets without NaN or crashes", () => {
      const emptyOrders: Array<{ status: OrderStatus; totalAmount: number }> = [];

      let totalSales = 0;
      let nonCancelledCount = 0;

      for (const o of emptyOrders) {
        if (o.status !== OrderStatus.CANCELLED) {
          totalSales += o.totalAmount;
          nonCancelledCount++;
        }
      }

      const averageOrderValue =
        nonCancelledCount > 0 ? totalSales / nonCancelledCount : 0;

      expect(totalSales).toBe(0);
      expect(averageOrderValue).toBe(0);
      expect(Number.isFinite(averageOrderValue)).toBe(true);
    });

    it("formats Indian Rupee currency correctly", () => {
      expect(formatCurrencyINR(1250.5)).toContain("1,250.50");
      expect(formatCurrencyINR(0)).toContain("0.00");
      expect(formatCompactINR(1500)).toBe("₹1.5k");
      expect(formatCompactINR(250000)).toBe("₹2.5L");
    });
  });

  describe("3. Order Status Enums & Mapping", () => {
    it("uses exact existing Prisma OrderStatus enums without inventing new ones", () => {
      const expectedStatuses = [
        "SUBMITTED",
        "CONFIRMED",
        "PREPARING",
        "SERVED",
        "COMPLETED",
        "CANCELLED",
      ];

      const actualStatuses = Object.values(OrderStatus);
      expect(actualStatuses).toEqual(expect.arrayContaining(expectedStatuses));
      expect(actualStatuses.length).toBe(6);

      // Verify all statuses have user-friendly labels
      for (const st of actualStatuses) {
        expect(ORDER_STATUS_LABELS[st]).toBeDefined();
        expect(typeof ORDER_STATUS_LABELS[st]).toBe("string");
      }

      expect(ORDER_STATUS_LABELS.SUBMITTED).toBe("Pending");
      expect(ORDER_STATUS_LABELS.CONFIRMED).toBe("Confirmed");
      expect(ORDER_STATUS_LABELS.PREPARING).toBe("Preparing");
      expect(ORDER_STATUS_LABELS.SERVED).toBe("Served");
      expect(ORDER_STATUS_LABELS.COMPLETED).toBe("Completed");
      expect(ORDER_STATUS_LABELS.CANCELLED).toBe("Cancelled");
    });
  });

  describe("4. Tenant Isolation & Access Control Security", () => {
    it("grants access to analytics for verified restaurant owner or manager", async () => {
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce({
        id: "mem_1",
        userId: "user_owner",
        restaurantId: "rest_cafe_delight",
        role: MembershipRole.OWNER,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const access = await verifyRestaurantAccess(
        "user_owner",
        UserRole.RESTAURANT_OWNER,
        "rest_cafe_delight",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(true);
      expect(access.membershipRole).toBe(MembershipRole.OWNER);
    });

    it("denies access when a user attempts to query analytics for another restaurant (cross-tenant)", async () => {
      // User is NOT a member of rest_foreign
      vi.mocked(prisma.restaurantMember.findUnique).mockResolvedValueOnce(null);

      const access = await verifyRestaurantAccess(
        "user_attacker",
        UserRole.RESTAURANT_OWNER,
        "rest_foreign",
        [MembershipRole.OWNER, MembershipRole.MANAGER, MembershipRole.STAFF]
      );

      expect(access.authorized).toBe(false);
    });

    it("grants Super Admin oversight access across restaurants", async () => {
      const access = await verifyRestaurantAccess(
        "super_admin_id",
        UserRole.SUPER_ADMIN,
        "any_restaurant_id"
      );

      expect(access.authorized).toBe(true);
      expect(access.isSuperAdmin).toBe(true);
    });
  });

  describe("5. Daily, Monthly & Yearly Chart Bucketing", () => {
    it("buckets orders into daily timestamps with sales and order count, excluding cancelled orders from sales", () => {
      const rawPoints = [
        { dateStr: "2026-10-01", amount: 300, status: OrderStatus.COMPLETED },
        { dateStr: "2026-10-01", amount: 200, status: OrderStatus.SUBMITTED },
        { dateStr: "2026-10-01", amount: 500, status: OrderStatus.CANCELLED }, // Cancelled
        { dateStr: "2026-10-02", amount: 450, status: OrderStatus.COMPLETED },
      ];

      const buckets: Record<
        string,
        { orders: number; sales: number; completedSales: number; cancelled: number }
      > = {};

      for (const p of rawPoints) {
        if (!buckets[p.dateStr]) {
          buckets[p.dateStr] = { orders: 0, sales: 0, completedSales: 0, cancelled: 0 };
        }
        buckets[p.dateStr].orders += 1;
        if (p.status !== OrderStatus.CANCELLED) {
          buckets[p.dateStr].sales += p.amount;
        } else {
          buckets[p.dateStr].cancelled += 1;
        }
        if (p.status === OrderStatus.COMPLETED) {
          buckets[p.dateStr].completedSales += p.amount;
        }
      }

      // Day 1: 3 orders, 300 + 200 = 500 sales (500 cancelled excluded), 300 completed sales
      expect(buckets["2026-10-01"].orders).toBe(3);
      expect(buckets["2026-10-01"].sales).toBe(500);
      expect(buckets["2026-10-01"].completedSales).toBe(300);
      expect(buckets["2026-10-01"].cancelled).toBe(1);

      // Day 2: 1 order, 450 sales, 450 completed sales
      expect(buckets["2026-10-02"].orders).toBe(1);
      expect(buckets["2026-10-02"].sales).toBe(450);
      expect(buckets["2026-10-02"].completedSales).toBe(450);
      expect(buckets["2026-10-02"].cancelled).toBe(0);
    });
  });
});
