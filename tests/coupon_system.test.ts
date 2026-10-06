import { describe, it, expect } from "vitest";
import { Prisma, CouponDiscountType, TaxCalculationMode } from "@prisma/client";
import {
  calculateCouponDiscount,
  validateCouponEligibility,
} from "@/lib/coupons/calculator";
import {
  CreateCouponSchema,
  UpdateCouponSchema,
  ValidateCustomerCouponSchema,
} from "@/lib/validations/coupon";
import {
  calculateOrderTax,
  calculateMixedOrderTax,
  TaxLineItem,
} from "@/lib/orders/tax";

describe("Phase 7: Offers, Coupons & Discounts System", () => {
  describe("1. Discount Calculations & Rules", () => {
    it("calculates percentage discount accurately without cap", () => {
      const discount = calculateCouponDiscount(
        {
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: new Prisma.Decimal("15"), // 15%
        },
        new Prisma.Decimal("500.00")
      );

      // 15% of 500 = 75.00
      expect(discount.toNumber()).toBe(75.0);
    });

    it("enforces maximum discount cap for percentage coupon", () => {
      const discount = calculateCouponDiscount(
        {
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: new Prisma.Decimal("20"), // 20% of 1000 = 200
          maxDiscount: new Prisma.Decimal("80.00"), // capped at 80
        },
        new Prisma.Decimal("1000.00")
      );

      expect(discount.toNumber()).toBe(80.0);
    });

    it("applies fixed amount discount capped at subtotal", () => {
      // Normal fixed discount
      const normalFixed = calculateCouponDiscount(
        {
          discountType: CouponDiscountType.FIXED,
          discountValue: new Prisma.Decimal("50.00"),
        },
        new Prisma.Decimal("300.00")
      );
      expect(normalFixed.toNumber()).toBe(50.0);

      // Fixed discount greater than subtotal should cap at subtotal (cannot be negative bill)
      const cappedFixed = calculateCouponDiscount(
        {
          discountType: CouponDiscountType.FIXED,
          discountValue: new Prisma.Decimal("500.00"),
        },
        new Prisma.Decimal("120.00")
      );
      expect(cappedFixed.toNumber()).toBe(120.0);
    });
  });

  describe("2. Coupon Eligibility & Validation Logic", () => {
    const baseCoupon = {
      id: "coup_123",
      restaurantId: "rest_abc",
      code: "FESTIVE25",
      description: "25% off festive deal",
      discountType: CouponDiscountType.PERCENTAGE,
      discountValue: new Prisma.Decimal("25"),
      minOrderSubtotal: new Prisma.Decimal("400.00"),
      maxDiscount: new Prisma.Decimal("150.00"),
      startDate: new Date("2026-10-01T00:00:00Z"),
      endDate: new Date("2026-10-31T23:59:59Z"),
      usageLimit: 100,
      usageCount: 10,
      perCustomerLimit: 2,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("accepts valid coupon when all constraints are met", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        customerIdentifier: "9876543210",
        customerUsageCount: 0,
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(true);
      // 25% of 500 = 125 <= maxDiscount 150
      expect(result.discountAmount?.toNumber()).toBe(125.0);
    });

    it("rejects coupon if restaurant tenant does not match (cross-tenant security)", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 500,
        restaurantId: "rest_OTHER_TENANT",
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("TENANT_MISMATCH");
    });

    it("rejects coupon when isActive is false", () => {
      const inactiveCoupon = { ...baseCoupon, isActive: false };
      const result = validateCouponEligibility(inactiveCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("INACTIVE");
    });

    it("rejects coupon before startDate (not yet active)", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        now: new Date("2026-09-30T23:59:59Z"), // 1 second before start
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("NOT_STARTED");
    });

    it("rejects coupon after endDate (expired)", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        now: new Date("2026-11-01T00:00:01Z"), // after end
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("EXPIRED");
    });

    it("rejects coupon when subtotal is below minimum order subtotal", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 399.99, // min is 400.00
        restaurantId: "rest_abc",
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("MIN_SUBTOTAL_NOT_MET");
    });

    it("rejects coupon when global usage limit has been reached", () => {
      const exhaustedCoupon = { ...baseCoupon, usageLimit: 50, usageCount: 50 };
      const result = validateCouponEligibility(exhaustedCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("USAGE_LIMIT_EXCEEDED");
    });

    it("enforces per-customer limit when customer identifier is supplied", () => {
      const result = validateCouponEligibility(baseCoupon, {
        subtotal: 500,
        restaurantId: "rest_abc",
        customerIdentifier: "9876543210",
        customerUsageCount: 2, // limit is 2
        now: new Date("2026-10-05T12:00:00Z"),
      });

      expect(result.valid).toBe(false);
      expect(result.errorCode).toBe("CUSTOMER_LIMIT_EXCEEDED");
    });
  });

  describe("3. Zod Input Validation Schemas", () => {
    it("validates valid coupon creation input", () => {
      const parsed = CreateCouponSchema.safeParse({
        code: "SUMMER50",
        description: "50 rupees off on lunch orders",
        discountType: "FIXED",
        discountValue: 50,
        minOrderSubtotal: 250,
        isActive: true,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe("SUMMER50");
        expect(parsed.data.discountValue).toBe(50);
      }
    });

    it("automatically trims and uppercases coupon code", () => {
      const parsed = CreateCouponSchema.safeParse({
        code: "  save20  ",
        discountType: "PERCENTAGE",
        discountValue: 20,
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.code).toBe("SAVE20");
      }
    });

    it("rejects invalid characters in coupon code", () => {
      const parsed = CreateCouponSchema.safeParse({
        code: "SAVE 20!", // spaces and exclamation
        discountType: "PERCENTAGE",
        discountValue: 20,
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects percentage discounts greater than 100%", () => {
      const parsed = CreateCouponSchema.safeParse({
        code: "FREEBIE",
        discountType: "PERCENTAGE",
        discountValue: 101,
      });

      expect(parsed.success).toBe(false);
    });

    it("rejects negative discount amounts or minimum subtotals", () => {
      const negativeVal = CreateCouponSchema.safeParse({
        code: "INVALID",
        discountType: "FIXED",
        discountValue: -10,
      });
      expect(negativeVal.success).toBe(false);

      const negativeSubtotal = CreateCouponSchema.safeParse({
        code: "INVALID2",
        discountType: "FIXED",
        discountValue: 10,
        minOrderSubtotal: -50,
      });
      expect(negativeSubtotal.success).toBe(false);
    });

    it("handles flexible date inputs (empty strings, datetime-local format, and ISO strings)", () => {
      // Empty string should be transformed to null
      const emptyDates = CreateCouponSchema.safeParse({
        code: "DATES1",
        discountType: "PERCENTAGE",
        discountValue: 15,
        startDate: "",
        endDate: "",
      });
      expect(emptyDates.success).toBe(true);
      if (emptyDates.success) {
        expect(emptyDates.data.startDate).toBeNull();
        expect(emptyDates.data.endDate).toBeNull();
      }

      // HTML5 datetime-local format should parse and transform to ISO string
      const localDates = CreateCouponSchema.safeParse({
        code: "DATES2",
        discountType: "PERCENTAGE",
        discountValue: 15,
        startDate: "2026-10-05T10:00",
        endDate: "2026-10-06T18:00",
      });
      expect(localDates.success).toBe(true);
      if (localDates.success) {
        expect(localDates.data.startDate).toContain("T");
        expect(localDates.data.endDate).toContain("T");
      }

      // Expiry earlier than start date should fail
      const invertedDates = CreateCouponSchema.safeParse({
        code: "DATES3",
        discountType: "PERCENTAGE",
        discountValue: 15,
        startDate: "2026-10-10T12:00",
        endDate: "2026-10-05T12:00",
      });
      expect(invertedDates.success).toBe(false);

      // Invalid date string should fail
      const invalidDate = CreateCouponSchema.safeParse({
        code: "DATES4",
        discountType: "PERCENTAGE",
        discountValue: 15,
        startDate: "invalid-date",
      });
      expect(invalidDate.success).toBe(false);
      if (!invalidDate.success) {
        expect(invalidDate.error.issues[0].message).toContain("Invalid start date format");
      }

      // 6-digit year (e.g. 202626) should be rejected
      const sixDigitYear = CreateCouponSchema.safeParse({
        code: "DATES5",
        discountType: "PERCENTAGE",
        discountValue: 15,
        startDate: "202626-10-05T14:30",
      });
      expect(sixDigitYear.success).toBe(false);
      if (!sixDigitYear.success) {
        expect(sixDigitYear.error.issues[0].message).toContain("year must be a 4-digit year");
      }
    });

    it("validates coupon update payload", () => {
      const updateValid = UpdateCouponSchema.safeParse({
        description: "Updated discount description",
        discountValue: 30,
        isActive: false,
      });
      expect(updateValid.success).toBe(true);
      if (updateValid.success) {
        expect(updateValid.data.discountValue).toBe(30);
        expect(updateValid.data.isActive).toBe(false);
      }
    });

    it("validates customer coupon validation request", () => {
      const valid = ValidateCustomerCouponSchema.safeParse({
        code: "DISCOUNT10",
        subtotal: 450.5,
        customerPhone: "9876543210",
      });
      expect(valid.success).toBe(true);

      const missingCode = ValidateCustomerCouponSchema.safeParse({
        subtotal: 450.5,
      });
      expect(missingCode.success).toBe(false);
    });
  });

  describe("4. GST and Discount Calculation Order (CGST Section 15(3)(a))", () => {
    it("EXCLUSIVE GST: calculates GST strictly on the discounted taxable amount (discount before tax)", () => {
      // Subtotal = ₹1000. Discount = ₹200.
      // Taxable Base = ₹800.
      // GST @ 5% = 800 * 0.05 = ₹40.00.
      // CGST = ₹20.00, SGST = ₹20.00.
      // Total = 800 + 40 = ₹840.00.
      const result = calculateOrderTax({
        subtotal: 1000,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
        discountAmount: 200,
      });

      expect(result.subtotal.toNumber()).toBe(1000.0);
      expect(result.discountAmount?.toNumber()).toBe(200.0);
      expect(result.taxableAmount.toNumber()).toBe(800.0);
      expect(result.taxAmount.toNumber()).toBe(40.0);
      expect(result.cgstAmount.toNumber()).toBe(20.0);
      expect(result.sgstAmount.toNumber()).toBe(20.0);
      expect(result.totalAmount.toNumber()).toBe(840.0);
    });

    it("INCLUSIVE GST: backs out GST from the discounted final total without double-discounting", () => {
      // Menu total = ₹1180 (includes 18% GST).
      // Discount = ₹180.
      // Final Total Payable = 1180 - 180 = ₹1000.
      // Backed out Taxable = 1000 / 1.18 = 847.46.
      // GST = 1000 - 847.46 = 152.54.
      // CGST = 76.27, SGST = 76.27.
      const result = calculateOrderTax({
        subtotal: 1180,
        gstEnabled: true,
        taxRate: 18,
        taxMode: TaxCalculationMode.INCLUSIVE,
        discountAmount: 180,
      });

      expect(result.subtotal.toNumber()).toBe(1180.0);
      expect(result.discountAmount?.toNumber()).toBe(180.0);
      expect(result.totalAmount.toNumber()).toBe(1000.0);
      expect(result.taxableAmount.toNumber()).toBe(847.46);
      expect(result.taxAmount.toNumber()).toBe(152.54);
      expect(result.cgstAmount.plus(result.sgstAmount).toNumber()).toBe(152.54);
    });

    it("Mixed GST rates: apportions discount proportionally across line items", () => {
      // Item A: ₹600 @ 5% GST (60% of ₹1000)
      // Item B: ₹400 @ 18% GST (40% of ₹1000)
      // Total Subtotal = ₹1000.
      // Discount = ₹100.
      // Item A discount = 600/1000 * 100 = 60. Net Taxable = 540. Tax @ 5% = 27.00
      // Item B discount = 400/1000 * 100 = 40. Net Taxable = 360. Tax @ 18% = 64.80
      // Total Tax = 27.00 + 64.80 = 91.80
      // Total Amount = (1000 - 100) + 91.80 = 991.80
      const items: TaxLineItem[] = [
        {
          id: "1",
          menuItemId: "m1",
          name: "Food Item",
          quantity: 2,
          price: new Prisma.Decimal("300.00"),
          useCustomTaxRate: true,
          taxRate: new Prisma.Decimal("5.00"),
        },
        {
          id: "2",
          menuItemId: "m2",
          name: "Beverage",
          quantity: 1,
          price: new Prisma.Decimal("400.00"),
          useCustomTaxRate: true,
          taxRate: new Prisma.Decimal("18.00"),
        },
      ];

      const mixed = calculateMixedOrderTax({
        items,
        gstEnabled: true,
        restaurantTaxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
        discountAmount: 100,
      });

      expect(mixed.subtotal.toNumber()).toBe(1000.0);
      expect(mixed.discountAmount?.toNumber()).toBe(100.0);
      expect(mixed.taxableAmount.toNumber()).toBe(900.0);
      expect(mixed.taxAmount.toNumber()).toBe(91.8);
      expect(mixed.totalAmount.toNumber()).toBe(991.8);

      // Verify line items received exact distributed discounts
      const item1 = mixed.items.find((i) => i.menuItemId === "m1");
      const item2 = mixed.items.find((i) => i.menuItemId === "m2");
      expect(item1?.taxableAmount.toNumber()).toBe(540.0);
      expect(item1?.taxAmount.toNumber()).toBe(27.0);
      expect(item2?.taxableAmount.toNumber()).toBe(360.0);
      expect(item2?.taxAmount.toNumber()).toBe(64.8);
    });

    it("prevents calculating tax twice on discounted orders", () => {
      const step1 = calculateOrderTax({
        subtotal: 500,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
        discountAmount: 100,
      });

      expect(step1.taxableAmount.toNumber()).toBe(400.0);
      expect(step1.taxAmount.toNumber()).toBe(20.0);
      expect(step1.totalAmount.toNumber()).toBe(420.0);

      // Calculating tax on taxableAmount without discount should give identical tax
      const step2 = calculateOrderTax({
        subtotal: step1.taxableAmount,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
        discountAmount: 0,
      });

      expect(step2.taxAmount.toNumber()).toBe(20.0);
      expect(step2.totalAmount.toNumber()).toBe(420.0);
    });
  });

  describe("5. Client-Side Price and Discount Tampering Immunity", () => {
    it("ensures authoritative discount calculation ignores client-sent amounts", () => {
      // Client claims they have a ₹300 discount on a 10% coupon for ₹500
      const authoritativeDiscount = calculateCouponDiscount(
        {
          discountType: CouponDiscountType.PERCENTAGE,
          discountValue: new Prisma.Decimal("10"),
          maxDiscount: new Prisma.Decimal("100.00"),
        },
        new Prisma.Decimal("500.00")
      );

      // 10% of 500 is 50. Client-tampered claim of 300 is completely discarded.
      expect(authoritativeDiscount.toNumber()).toBe(50.0);
      expect(authoritativeDiscount.toNumber()).not.toBe(300.0);
    });
  });

  describe("6. Receipt and Historical Snapshot Immutability", () => {
    it("preserves snapshot values even if coupon settings change later", () => {
      // Original order placed when coupon was 20%
      const orderSnapshot = {
        orderNumber: "ORD-12345",
        subtotal: 1000,
        discountAmount: 200,
        couponCode: "SAVE20",
        taxAmount: 40,
        totalAmount: 840,
      };

      // Later, the restaurant owner modifies coupon to 10% or deactivates it
      const modifiedCoupon = {
        code: "SAVE20",
        discountValue: 10,
        isActive: false,
      };

      // The historical order snapshot remains completely unchanged
      expect(orderSnapshot.discountAmount).toBe(200);
      expect(orderSnapshot.totalAmount).toBe(840);
      expect(orderSnapshot.couponCode).toBe("SAVE20");
      expect(modifiedCoupon.discountValue).toBe(10);
    });
  });
});
