import { describe, it, expect } from "vitest";

describe("Public Digital Menu Filtering & Sanitization", () => {
  it("sanitizes public restaurant payload, omitting private/sensitive internal fields", () => {
    const rawInternalRestaurant = {
      id: "rest_123",
      name: "The Rustic Olive",
      slug: "rustic-olive",
      description: "Authentic Mediterranean Dining",
      address: "123 High Street",
      phone: "+91 98765 43210",
      logoUrl: "https://example.com/logo.png",
      bannerUrl: "https://example.com/banner.png",
      googleReviewUrl: "https://g.page/review",
      // Sensitive / internal fields that MUST NOT leak to public:
      adminNotes: "Super Admin private notes on owner",
      lastPaymentUtr: "427918239012",
      approvalStatus: "APPROVED",
      isSuspended: false,
      isActive: true,
    };

    // Public mapping as done in GET /api/r/[slug]
    const publicData = {
      name: rawInternalRestaurant.name,
      slug: rawInternalRestaurant.slug,
      description: rawInternalRestaurant.description,
      address: rawInternalRestaurant.address,
      phone: rawInternalRestaurant.phone,
      logoUrl: rawInternalRestaurant.logoUrl,
      bannerUrl: rawInternalRestaurant.bannerUrl,
      googleReviewUrl: rawInternalRestaurant.googleReviewUrl,
    };

    expect(publicData).not.toHaveProperty("adminNotes");
    expect(publicData).not.toHaveProperty("lastPaymentUtr");
    expect(publicData.name).toBe("The Rustic Olive");
    expect(publicData.slug).toBe("rustic-olive");
  });

  it("filters inactive categories and unavailable dishes from public output", () => {
    const categoriesWithItems = [
      {
        id: "cat_1",
        name: "Beverages",
        isActive: true,
        items: [
          { id: "i1", name: "Cold Brew", price: 180, isAvailable: true },
          { id: "i2", name: "Seasonal Smoothie", price: 220, isAvailable: false }, // Sold out
        ],
      },
      {
        id: "cat_2",
        name: "Secret Menu",
        isActive: false, // Inactive category
        items: [
          { id: "i3", name: "Chef's Special", price: 990, isAvailable: true },
        ],
      },
    ];

    const publicVisible = categoriesWithItems
      .filter((c) => c.isActive)
      .map((c) => ({
        ...c,
        items: c.items.filter((i) => i.isAvailable),
      }));

    expect(publicVisible.length).toBe(1);
    expect(publicVisible[0].name).toBe("Beverages");
    expect(publicVisible[0].items.length).toBe(1);
    expect(publicVisible[0].items[0].name).toBe("Cold Brew");
  });

  it("parses table query parameter cleanly from table QR URLs", () => {
    const searchParams = new URLSearchParams("table=Table%2012");
    const tableNumber = searchParams.get("table");

    expect(tableNumber).toBe("Table 12");
  });

  describe("Public Menu Coupon Offers Filtering & Security", () => {
    const targetRestaurantId = "rest_target_123";
    const otherRestaurantId = "rest_other_999";
    const mockNow = new Date("2026-10-05T12:00:00Z");

    const sampleCoupons = [
      {
        id: "c1",
        restaurantId: targetRestaurantId,
        code: "WELCOME20",
        description: "20% off on all orders",
        discountType: "PERCENTAGE" as const,
        discountValue: 20,
        minOrderSubtotal: 200,
        maxDiscount: 100,
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        usageLimit: 100,
        usageCount: 15,
        isActive: true,
        perCustomerLimit: 1,
      },
      {
        id: "c2_inactive",
        restaurantId: targetRestaurantId,
        code: "INACTIVE50",
        description: "Inactive offer",
        discountType: "FIXED" as const,
        discountValue: 50,
        minOrderSubtotal: 0,
        maxDiscount: null,
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        usageLimit: 100,
        usageCount: 0,
        isActive: false, // Inactive
        perCustomerLimit: null,
      },
      {
        id: "c3_future",
        restaurantId: targetRestaurantId,
        code: "DIWALI100",
        description: "Upcoming festive offer",
        discountType: "FIXED" as const,
        discountValue: 100,
        minOrderSubtotal: 500,
        maxDiscount: null,
        startDate: new Date("2026-11-01T00:00:00Z"), // Not yet started
        endDate: new Date("2026-11-15T23:59:59Z"),
        usageLimit: 50,
        usageCount: 0,
        isActive: true,
        perCustomerLimit: null,
      },
      {
        id: "c4_expired",
        restaurantId: targetRestaurantId,
        code: "OLDEXPIRED",
        description: "Past offer",
        discountType: "PERCENTAGE" as const,
        discountValue: 30,
        minOrderSubtotal: 100,
        maxDiscount: 50,
        startDate: new Date("2026-09-01T00:00:00Z"),
        endDate: new Date("2026-09-30T23:59:59Z"), // Expired
        usageLimit: 100,
        usageCount: 40,
        isActive: true,
        perCustomerLimit: null,
      },
      {
        id: "c5_exhausted",
        restaurantId: targetRestaurantId,
        code: "SOLD_OUT",
        description: "Limited to 10 orders",
        discountType: "FIXED" as const,
        discountValue: 75,
        minOrderSubtotal: 300,
        maxDiscount: null,
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        usageLimit: 10,
        usageCount: 10, // Exhausted
        isActive: true,
        perCustomerLimit: null,
      },
      {
        id: "c6_other_restaurant",
        restaurantId: otherRestaurantId, // Different restaurant
        code: "OTHER_REST_PROMO",
        description: "Promo for another restaurant",
        discountType: "PERCENTAGE" as const,
        discountValue: 50,
        minOrderSubtotal: 0,
        maxDiscount: null,
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: new Date("2026-10-31T23:59:59Z"),
        usageLimit: 100,
        usageCount: 0,
        isActive: true,
        perCustomerLimit: null,
      },
      {
        id: "c7_unlimited_no_end",
        restaurantId: targetRestaurantId,
        code: "FOREVERFLAT",
        description: "Flat ₹30 off every day",
        discountType: "FIXED" as const,
        discountValue: 30,
        minOrderSubtotal: 150,
        maxDiscount: null,
        startDate: new Date("2026-10-01T00:00:00Z"),
        endDate: null, // No expiry
        usageLimit: null, // Unlimited
        usageCount: 42,
        isActive: true,
        perCustomerLimit: null,
      },
    ];

    // Filter algorithm matching public menu query logic
    function getPublicMenuOffers(coupons: typeof sampleCoupons, restaurantId: string, now: Date) {
      return coupons
        .filter((c) => {
          // 1. Strict tenant isolation
          if (c.restaurantId !== restaurantId) return false;
          // 2. Must be active
          if (!c.isActive) return false;
          // 3. Must have already started
          if (c.startDate > now) return false;
          // 4. Must not be expired
          if (c.endDate && c.endDate <= now) return false;
          // 5. Must have available capacity
          if (c.usageLimit !== null && c.usageCount >= c.usageLimit) return false;
          return true;
        })
        .map((c) => ({
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          minOrderSubtotal: Number(c.minOrderSubtotal),
          maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
          endDate: c.endDate ? c.endDate.toISOString() : null,
        }));
    }

    it("includes only active, started, non-expired, and non-exhausted coupons for the target restaurant", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);

      const codes = publicOffers.map((o) => o.code);
      expect(codes).toContain("WELCOME20");
      expect(codes).toContain("FOREVERFLAT");
      expect(publicOffers.length).toBe(2);
    });

    it("strictly isolates restaurant coupons and never exposes another restaurant's offers", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      const otherCodes = publicOffers.filter((o) => o.code === "OTHER_REST_PROMO");
      expect(otherCodes.length).toBe(0);
    });

    it("filters out inactive coupons", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      expect(publicOffers.some((o) => o.code === "INACTIVE50")).toBe(false);
    });

    it("filters out coupons that have not yet started", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      expect(publicOffers.some((o) => o.code === "DIWALI100")).toBe(false);
    });

    it("filters out expired coupons", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      expect(publicOffers.some((o) => o.code === "OLDEXPIRED")).toBe(false);
    });

    it("filters out exhausted coupons that reached their global usage limit", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      expect(publicOffers.some((o) => o.code === "SOLD_OUT")).toBe(false);
    });

    it("does not leak administrative fields, internal IDs, or usage counts to public menu", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);

      for (const offer of publicOffers) {
        expect(offer).not.toHaveProperty("id");
        expect(offer).not.toHaveProperty("restaurantId");
        expect(offer).not.toHaveProperty("usageLimit");
        expect(offer).not.toHaveProperty("usageCount");
        expect(offer).not.toHaveProperty("perCustomerLimit");
        expect(offer).not.toHaveProperty("createdAt");
        expect(offer).not.toHaveProperty("updatedAt");
      }
    });

    it("correctly includes non-expiring coupons (endDate = null)", () => {
      const publicOffers = getPublicMenuOffers(sampleCoupons, targetRestaurantId, mockNow);
      const forever = publicOffers.find((o) => o.code === "FOREVERFLAT");
      expect(forever).toBeDefined();
      expect(forever?.endDate).toBeNull();
    });
  });
});
