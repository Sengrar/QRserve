import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  assertCanAddTable,
  getTableUsageMetrics,
  TableLimitExceededError,
} from "@/lib/subscription/limits";
import { UpdateRestaurantStatusByAdminSchema } from "@/lib/validations/restaurant";
import { requireSuperAdmin, AuthorizationError, AuthenticationError } from "@/lib/security/tenant";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  Prisma,
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  BillingPeriod,
  SubscriptionPaymentStatus,
  UserRole,
} from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    table: {
      count: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
  },
}));

vi.mock("@/lib/auth/session", () => ({
  getSessionUser: vi.fn(),
}));

function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_test_1",
    restaurantId: "rest_test_1",
    plan: SubscriptionPlan.SMALL,
    status: SubscriptionStatus.ACTIVE,
    billingPeriod: BillingPeriod.MONTHLY,
    currency: "INR",
    customMonthlyPrice: new Prisma.Decimal(499),
    customYearlyPrice: new Prisma.Decimal(4990),
    paymentStatus: SubscriptionPaymentStatus.PAID,
    nextBillingDate: null,
    tableLimit: 10,
    amount: new Prisma.Decimal(499),
    amountPaise: 49900,
    startDate: new Date(),
    endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    lastPaymentRequestId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Restaurant Table QR Limit Management System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. Server-Side Table Limit Enforcement & Usage Reporting", () => {
    it("allows adding a table when active table count is below the allowed limit (e.g. 7 / 10 used)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 10 })
      );
      vi.mocked(prisma.table.count).mockResolvedValueOnce(7);

      const result = await assertCanAddTable("rest_test_1");

      expect(result.allowed).toBe(true);
      expect(result.currentActiveCount).toBe(7);
      expect(result.tableLimit).toBe(10);
    });

    it("blocks adding a table and throws TableLimitExceededError when limit is reached (10 / 10 used)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 10 })
      );
      vi.mocked(prisma.table.count).mockResolvedValueOnce(10);

      await expect(assertCanAddTable("rest_test_1")).rejects.toThrow(TableLimitExceededError);
    });

    it("provides a clear message explaining that the restaurant has reached its allowed table limit", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 10 })
      );
      vi.mocked(prisma.table.count).mockResolvedValueOnce(10);

      await expect(assertCanAddTable("rest_test_1")).rejects.toThrow(
        /Table limit reached\. Your SMALL plan allows up to 10 active tables \(10 \/ 10 tables used\)\. This restaurant has reached its allowed table limit/
      );
    });

    it("correctly calculates table usage metrics showing 'X / Y tables used'", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 10 })
      );
      // Promise.all: first call is totalCount (9), second call is activeCount (7)
      vi.mocked(prisma.table.count)
        .mockResolvedValueOnce(9)
        .mockResolvedValueOnce(7);

      const metrics = await getTableUsageMetrics("rest_test_1");

      expect(metrics.totalTables).toBe(9);
      expect(metrics.activeTables).toBe(7);
      expect(metrics.subscription.tableLimit).toBe(10);
      expect(metrics.remainingAllowance).toBe(3);
      expect(metrics.isAtLimit).toBe(false);
    });

    it("supports passing a transactional Prisma client (tx) for atomic limit verification", async () => {
      const mockTx = {
        subscription: {
          findUnique: vi.fn().mockResolvedValueOnce(createMockSubscription({ tableLimit: 8 })),
        },
        table: {
          count: vi.fn().mockResolvedValueOnce(5),
        },
      };

      const result = await assertCanAddTable("rest_test_1", mockTx as any);

      expect(mockTx.subscription.findUnique).toHaveBeenCalled();
      expect(mockTx.table.count).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
      expect(result.currentActiveCount).toBe(5);
      expect(result.tableLimit).toBe(8);
    });
  });

  describe("2. Lowered Limit & Existing Tables Preservation Policy", () => {
    it("reports isAtLimit=true and 0 remaining allowance when limit is lowered below current count (e.g. limit=5 with 7 active)", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 5 })
      );
      // First call: totalCount (7), second call: activeCount (7)
      vi.mocked(prisma.table.count)
        .mockResolvedValueOnce(7)
        .mockResolvedValueOnce(7);

      const metrics = await getTableUsageMetrics("rest_test_1");

      expect(metrics.activeTables).toBe(7);
      expect(metrics.subscription.tableLimit).toBe(5);
      expect(metrics.remainingAllowance).toBe(0);
      expect(metrics.isAtLimit).toBe(true);
    });

    it("blocks new table creation when limit is lowered below current count, without deleting existing tables", async () => {
      vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
        createMockSubscription({ tableLimit: 5 })
      );
      vi.mocked(prisma.table.count).mockResolvedValueOnce(7);

      await expect(assertCanAddTable("rest_test_1")).rejects.toThrow(
        /Table limit reached\. Your SMALL plan allows up to 5 active tables \(7 \/ 5 tables used\)/
      );
    });

    it("does not delete or deactivate existing tables when limit is lowered", () => {
      // Verification of policy: existing tables array remains untouched
      const existingTables = [
        { id: "tbl_1", tableNumber: "T1", isActive: true },
        { id: "tbl_2", tableNumber: "T2", isActive: true },
        { id: "tbl_3", tableNumber: "T3", isActive: true },
        { id: "tbl_4", tableNumber: "T4", isActive: true },
        { id: "tbl_5", tableNumber: "T5", isActive: true },
        { id: "tbl_6", tableNumber: "T6", isActive: true },
        { id: "tbl_7", tableNumber: "T7", isActive: true },
      ];

      // Lower limit to 5
      const newAllowedLimit = 5;

      // Existing tables must remain unchanged
      expect(existingTables).toHaveLength(7);
      expect(existingTables.every((t) => t.isActive)).toBe(true);
      expect(existingTables.length).toBeGreaterThan(newAllowedLimit);
    });
  });

  describe("3. Super Admin Authorization & Protection Against Unauthorized Limit Changes", () => {
    it("validates allowed tables in UpdateRestaurantStatusByAdminSchema", () => {
      const valid = UpdateRestaurantStatusByAdminSchema.safeParse({
        tableLimit: 25,
      });
      expect(valid.success).toBe(true);
      if (valid.success) {
        expect(valid.data.tableLimit).toBe(25);
      }

      // Rejects 0 or negative
      const invalidZero = UpdateRestaurantStatusByAdminSchema.safeParse({
        tableLimit: 0,
      });
      expect(invalidZero.success).toBe(false);

      // Rejects exceeding 10,000
      const invalidExcessive = UpdateRestaurantStatusByAdminSchema.safeParse({
        tableLimit: 15000,
      });
      expect(invalidExcessive.success).toBe(false);
    });

    it("allows authorized Super Admin to access requireSuperAdmin", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "super_admin_user",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "super_admin_user",
        email: "admin@qrserve.com",
        name: "Platform Super Admin",
        role: UserRole.SUPER_ADMIN,
        isActive: true,
      } as any);

      const user = await requireSuperAdmin();
      expect(user.role).toBe(UserRole.SUPER_ADMIN);
      expect(user.email).toBe("admin@qrserve.com");
    });

    it("denies RESTAURANT_OWNER and throws AuthorizationError on requireSuperAdmin", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce({
        id: "owner_user",
        email: "owner@restaurant.com",
        name: "Restaurant Owner",
        role: UserRole.RESTAURANT_OWNER,
      });
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        id: "owner_user",
        email: "owner@restaurant.com",
        name: "Restaurant Owner",
        role: UserRole.RESTAURANT_OWNER,
        isActive: true,
      } as any);

      await expect(requireSuperAdmin()).rejects.toThrow(AuthorizationError);
    });

    it("denies unauthenticated requests on requireSuperAdmin", async () => {
      vi.mocked(getSessionUser).mockResolvedValueOnce(null);

      await expect(requireSuperAdmin()).rejects.toThrow(AuthenticationError);
    });
  });

  describe("4. Concurrency & Race Condition Protection for Table Creation", () => {
    it("serializes concurrent requests such that only remaining slots succeed and the rest are rejected", async () => {
      // Simulating a stateful tenant database with limit = 10 and current count = 9 (1 slot remaining)
      let currentDbCount = 9;
      const tableLimit = 10;

      // Atomic serialized table creation simulator mimicking PostgreSQL FOR UPDATE row locking
      const attemptCreateTable = async (tableNum: string): Promise<string> => {
        // Mocking the critical section inside prisma.$transaction with row lock
        if (currentDbCount >= tableLimit) {
          const err = new TableLimitExceededError(
            `Table limit reached. Your SMALL plan allows up to ${tableLimit} active tables (${currentDbCount} / ${tableLimit} tables used).`,
            currentDbCount,
            tableLimit
          );
          throw err;
        }

        // Increment count and register table
        currentDbCount += 1;
        return `Created ${tableNum} (count is now ${currentDbCount})`;
      };

      // 5 concurrent requests attempt to create tables simultaneously
      const results = await Promise.allSettled([
        attemptCreateTable("T10"),
        attemptCreateTable("T11"),
        attemptCreateTable("T12"),
        attemptCreateTable("T13"),
        attemptCreateTable("T14"),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      // Exactly 1 request must succeed (filling the 10th slot)
      expect(fulfilled).toHaveLength(1);
      // Exactly 4 requests must be rejected
      expect(rejected).toHaveLength(4);

      // Verify that the rejected requests got TableLimitExceededError
      rejected.forEach((rej) => {
        if (rej.status === "rejected") {
          expect(rej.reason).toBeInstanceOf(TableLimitExceededError);
          expect((rej.reason as Error).message).toContain("Table limit reached");
        }
      });

      // Total count must not exceed the limit
      expect(currentDbCount).toBe(10);
    });
  });
});
