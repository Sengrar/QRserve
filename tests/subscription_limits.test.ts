import { describe, it, expect, vi, beforeEach } from "vitest";
import { assertCanAddTable, TableLimitExceededError, SubscriptionRequiredError } from "@/lib/subscription/limits";
import { prisma } from "@/lib/db/prisma";
import { Prisma, Subscription, SubscriptionPlan, SubscriptionStatus, BillingPeriod, SubscriptionPaymentStatus } from "@prisma/client";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    subscription: {
      findUnique: vi.fn(),
    },
    table: {
      count: vi.fn(),
    },
  },
}));

function createMockSubscription(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: "sub_1",
    restaurantId: "rest_1",
    plan: SubscriptionPlan.SMALL,
    status: SubscriptionStatus.ACTIVE,
    billingPeriod: BillingPeriod.MONTHLY,
    currency: "INR",
    customMonthlyPrice: new Prisma.Decimal(499),
    customYearlyPrice: new Prisma.Decimal(4990),
    paymentStatus: SubscriptionPaymentStatus.PAID,
    nextBillingDate: null,
    tableLimit: 5,
    amount: new Prisma.Decimal(499),
    amountPaise: 49900,
    startDate: new Date(),
    endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000),
    lastPaymentRequestId: null,
    notes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe("Server-Side Table Limits & Safe Expiry Policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks table addition when restaurant has no subscription", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(null);

    await expect(assertCanAddTable("rest_1")).rejects.toThrow(SubscriptionRequiredError);
  });

  it("blocks table addition when subscription has expired", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        startDate: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
        endDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Expired 5 days ago
      })
    );

    await expect(assertCanAddTable("rest_1")).rejects.toThrow(
      "Your monthly subscription has expired. Please renew your subscription to create new tables. Existing tables remain preserved."
    );
  });

  it("blocks table addition when subscription is suspended by admin", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        status: SubscriptionStatus.SUSPENDED,
      })
    );

    await expect(assertCanAddTable("rest_1")).rejects.toThrow(
      "Your subscription is suspended. Please contact platform administration."
    );
  });

  it("enforces Small plan limit (max 5 tables) and blocks 6th table attempt", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        tableLimit: 5,
      })
    );

    // Currently has 5 active tables
    vi.mocked(prisma.table.count).mockResolvedValueOnce(5);

    await expect(assertCanAddTable("rest_1")).rejects.toThrow(
      /Table limit reached\. Your SMALL plan allows up to 5 active tables/
    );
  });

  it("allows table addition on Small plan when under limit", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        tableLimit: 5,
      })
    );

    // Currently has 4 active tables
    vi.mocked(prisma.table.count).mockResolvedValueOnce(4);

    const result = await assertCanAddTable("rest_1");
    expect(result.allowed).toBe(true);
    expect(result.currentActiveCount).toBe(4);
    expect(result.tableLimit).toBe(5);
  });

  it("enforces Medium plan limit (max 10 tables)", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        id: "sub_2",
        restaurantId: "rest_2",
        plan: SubscriptionPlan.MEDIUM,
        tableLimit: 10,
        amount: new Prisma.Decimal(999),
        amountPaise: 99900,
      })
    );

    vi.mocked(prisma.table.count).mockResolvedValueOnce(10);

    await expect(assertCanAddTable("rest_2")).rejects.toThrow(TableLimitExceededError);
  });

  it("enforces Large plan custom subscribed table limit", async () => {
    vi.mocked(prisma.subscription.findUnique).mockResolvedValueOnce(
      createMockSubscription({
        id: "sub_3",
        restaurantId: "rest_3",
        plan: SubscriptionPlan.LARGE,
        tableLimit: 25, // Purchased 25 tables
        amount: new Prisma.Decimal(2500),
        amountPaise: 250000,
      })
    );

    vi.mocked(prisma.table.count).mockResolvedValueOnce(25);

    await expect(assertCanAddTable("rest_3")).rejects.toThrow(
      /Table limit reached.*LARGE plan allows up to 25/
    );
  });
});
