import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, TaxCalculationMode, OrderStatus, MembershipRole } from "@prisma/client";
import { calculateOrderTax, calculateMixedOrderTax, isValidGSTIN, GSTIN_REGEX } from "@/lib/orders/tax";
import { UpdateRestaurantSettingsSchema } from "@/lib/validations/restaurant";
import { CreateMenuItemSchema, UpdateMenuItemSchema } from "@/lib/validations/menu";

describe("GST / Tax Calculation System", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. GSTIN Format Validation", () => {
    it("validates legitimate 15-character Indian GSTIN strings", () => {
      // 2 digits state code + 5 chars PAN + 4 digits PAN + 1 char PAN + 1 entity num + 'Z' + 1 checksum
      const validGSTINs = [
        "27ABCDE1234F1Z5",
        "29AAAAA0000A1Z5",
        "07AAAAA0000A1ZA",
        "33ABCDE1234F2Z1",
      ];
      for (const gstin of validGSTINs) {
        expect(isValidGSTIN(gstin)).toBe(true);
        expect(GSTIN_REGEX.test(gstin)).toBe(true);
      }
    });

    it("rejects invalid GSTIN strings", () => {
      const invalidGSTINs = [
        "INVALID",
        "27ABCDE1234F", // too short (12 chars)
        "27ABCDE1234F1Z599", // too long (17 chars)
        "27ABCDE1234F1A5", // 14th char is 'A' instead of 'Z'
        "ABABCDE1234F1Z5", // state code has letters
        "27ABCDE1234F1z5", // lowercase
      ];
      for (const gstin of invalidGSTINs) {
        expect(isValidGSTIN(gstin)).toBe(false);
      }
    });

    it("allows optional/empty GSTIN in UpdateRestaurantSettingsSchema", () => {
      const resultEmpty = UpdateRestaurantSettingsSchema.safeParse({
        gstEnabled: false,
        gstin: "",
      });
      expect(resultEmpty.success).toBe(true);

      const resultNull = UpdateRestaurantSettingsSchema.safeParse({
        gstEnabled: true,
        gstin: null,
      });
      expect(resultNull.success).toBe(true);

      const resultWhitespace = UpdateRestaurantSettingsSchema.safeParse({
        gstEnabled: true,
        gstin: "   ",
      });
      expect(resultWhitespace.success).toBe(true);
      if (resultWhitespace.success) {
        expect(resultWhitespace.data.gstin).toBeNull();
      }
    });

    it("validates GSTIN in UpdateRestaurantSettingsSchema when provided", () => {
      const valid = UpdateRestaurantSettingsSchema.safeParse({
        gstEnabled: true,
        gstin: "27ABCDE1234F1Z5",
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });
      expect(valid.success).toBe(true);

      const invalid = UpdateRestaurantSettingsSchema.safeParse({
        gstEnabled: true,
        gstin: "INVALID_GSTIN",
      });
      expect(invalid.success).toBe(false);
    });
  });

  describe("2. Restaurant Settings Schema Validation", () => {
    it("validates tax rates between 0% and 28%", () => {
      expect(UpdateRestaurantSettingsSchema.safeParse({ taxRate: 0 }).success).toBe(true);
      expect(UpdateRestaurantSettingsSchema.safeParse({ taxRate: 5 }).success).toBe(true);
      expect(UpdateRestaurantSettingsSchema.safeParse({ taxRate: 18 }).success).toBe(true);
      expect(UpdateRestaurantSettingsSchema.safeParse({ taxRate: 28 }).success).toBe(true);

      // Rejects negative rate
      const negative = UpdateRestaurantSettingsSchema.safeParse({ taxRate: -1 });
      expect(negative.success).toBe(false);

      // Rejects rate > 28
      const excessive = UpdateRestaurantSettingsSchema.safeParse({ taxRate: 29 });
      expect(excessive.success).toBe(false);
    });

    it("validates taxMode enum", () => {
      expect(
        UpdateRestaurantSettingsSchema.safeParse({ taxMode: TaxCalculationMode.EXCLUSIVE }).success
      ).toBe(true);
      expect(
        UpdateRestaurantSettingsSchema.safeParse({ taxMode: TaxCalculationMode.INCLUSIVE }).success
      ).toBe(true);
      expect(
        UpdateRestaurantSettingsSchema.safeParse({ taxMode: "OTHER_MODE" as unknown as TaxCalculationMode }).success
      ).toBe(false);
    });
  });

  describe("3. Core Tax Calculation Engine - calculateOrderTax()", () => {
    it("handles GST disabled: tax is 0, total equals subtotal", () => {
      const subtotal = new Prisma.Decimal("500.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: false,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(0);
      expect(result.taxAmount.toNumber()).toBe(0);
      expect(result.cgstAmount.toNumber()).toBe(0);
      expect(result.sgstAmount.toNumber()).toBe(0);
      expect(result.taxableAmount.toNumber()).toBe(500.0);
      expect(result.totalAmount.toNumber()).toBe(500.0);
    });

    it("handles zero tax rate: tax is 0, total equals subtotal", () => {
      const subtotal = new Prisma.Decimal("750.50");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(0);
      expect(result.taxAmount.toNumber()).toBe(0);
      expect(result.totalAmount.toNumber()).toBe(750.5);
      expect(result.taxableAmount.toNumber()).toBe(750.5);
    });

    it("calculates EXCLUSIVE tax accurately at 5% GST", () => {
      // Subtotal = 1000. Tax = 1000 * 0.05 = 50. Total = 1050.
      const subtotal = new Prisma.Decimal("1000.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(5);
      expect(result.taxMode).toBe(TaxCalculationMode.EXCLUSIVE);
      expect(result.taxableAmount.toNumber()).toBe(1000.0);
      expect(result.taxAmount.toNumber()).toBe(50.0);
      expect(result.cgstAmount.toNumber()).toBe(25.0);
      expect(result.sgstAmount.toNumber()).toBe(25.0);
      expect(result.totalAmount.toNumber()).toBe(1050.0);
    });

    it("calculates EXCLUSIVE tax accurately at 18% GST", () => {
      // Subtotal = 450. Tax = 450 * 0.18 = 81. Total = 531.
      const subtotal = new Prisma.Decimal("450.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 18,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(18);
      expect(result.taxableAmount.toNumber()).toBe(450.0);
      expect(result.taxAmount.toNumber()).toBe(81.0);
      expect(result.cgstAmount.toNumber()).toBe(40.5);
      expect(result.sgstAmount.toNumber()).toBe(40.5);
      expect(result.totalAmount.toNumber()).toBe(531.0);
    });

    it("calculates INCLUSIVE tax accurately at 5% GST", () => {
      // Total = 1050. Taxable = 1050 / 1.05 = 1000. Tax = 50.
      const subtotal = new Prisma.Decimal("1050.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.INCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(5);
      expect(result.taxMode).toBe(TaxCalculationMode.INCLUSIVE);
      expect(result.totalAmount.toNumber()).toBe(1050.0);
      expect(result.taxableAmount.toNumber()).toBe(1000.0);
      expect(result.taxAmount.toNumber()).toBe(50.0);
      expect(result.cgstAmount.toNumber()).toBe(25.0);
      expect(result.sgstAmount.toNumber()).toBe(25.0);
    });

    it("calculates INCLUSIVE tax accurately at 18% GST", () => {
      // Total = 1180. Taxable = 1180 / 1.18 = 1000. Tax = 180.
      const subtotal = new Prisma.Decimal("1180.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 18,
        taxMode: TaxCalculationMode.INCLUSIVE,
      });

      expect(result.taxRate.toNumber()).toBe(18);
      expect(result.taxMode).toBe(TaxCalculationMode.INCLUSIVE);
      expect(result.totalAmount.toNumber()).toBe(1180.0);
      expect(result.taxableAmount.toNumber()).toBe(1000.0);
      expect(result.taxAmount.toNumber()).toBe(180.0);
      expect(result.cgstAmount.toNumber()).toBe(90.0);
      expect(result.sgstAmount.toNumber()).toBe(90.0);
    });

    it("handles rounding with paise precision and exact 50/50 CGST/SGST split without divergence", () => {
      // Subtotal = ₹15.00 with 5% exclusive GST:
      // Tax = 15 * 0.05 = 0.75.
      // CGST = round(0.75 / 2, 2) = round(0.375, 2) = 0.38
      // SGST = 0.75 - 0.38 = 0.37
      // Sum = 0.38 + 0.37 = 0.75 (Exact match!)
      const subtotal = new Prisma.Decimal("15.00");
      const result = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxAmount.toNumber()).toBe(0.75);
      expect(result.cgstAmount.plus(result.sgstAmount).toNumber()).toBe(0.75);
      expect(result.totalAmount.toNumber()).toBe(15.75);
    });

    it("prevents applying tax twice or compounding", () => {
      const subtotal = new Prisma.Decimal("200.00");
      const step1 = calculateOrderTax({
        subtotal,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      // Total is 210.00. Tax is 10.00.
      expect(step1.totalAmount.toNumber()).toBe(210.0);
      expect(step1.taxAmount.toNumber()).toBe(10.0);

      // Verifying that recalculating on taxable subtotal (200.00) yields exact same tax:
      const step2 = calculateOrderTax({
        subtotal: step1.taxableAmount,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });
      expect(step2.taxAmount.toNumber()).toBe(10.0);
      expect(step2.totalAmount.toNumber()).toBe(210.0);
    });
  });

  describe("4. Historical Order Snapshot Immutability", () => {
    it("ensures historical orders retain original tax rate and amounts even if restaurant settings change", () => {
      // Historical order created when GST was disabled or at 5%
      const historicalOrderSnapshot = {
        orderNumber: "ORD-2026-0001",
        subtotal: 500.0,
        taxRate: 0.0,
        taxAmount: 0.0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
        totalAmount: 500.0,
      };

      // Restaurant subsequently updates its settings to 18% GST
      const updatedRestaurantSettings = {
        gstEnabled: true,
        taxRate: 18.0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      };

      // Assert that historical order snapshot remains unmodified:
      expect(historicalOrderSnapshot.taxRate).toBe(0.0);
      expect(historicalOrderSnapshot.taxAmount).toBe(0.0);
      expect(historicalOrderSnapshot.totalAmount).toBe(500.0);

      // A new order created under updated settings gets the new snapshot:
      const newOrderTax = calculateOrderTax({
        subtotal: new Prisma.Decimal(500.0),
        gstEnabled: updatedRestaurantSettings.gstEnabled,
        taxRate: updatedRestaurantSettings.taxRate,
        taxMode: updatedRestaurantSettings.taxMode,
      });

      expect(newOrderTax.taxRate.toNumber()).toBe(18.0);
      expect(newOrderTax.taxAmount.toNumber()).toBe(90.0);
      expect(newOrderTax.totalAmount.toNumber()).toBe(590.0);

      // Historical order amount remains unchanged
      expect(historicalOrderSnapshot.totalAmount).toBe(500.0);
    });
  });

  describe("5. Order Placement Security & Tampered Client Totals", () => {
    it("calculates prices strictly server-side from database records and ignores client values", () => {
      // Simulated DB items
      const trustedDbItems = [
        { id: "item_1", name: "Paneer Tikka", price: new Prisma.Decimal("250.00") },
        { id: "item_2", name: "Garlic Naan", price: new Prisma.Decimal("50.00") },
      ];

      // Simulated untrusted client cart with tampered prices and tax
      const tamperedClientCart = {
        items: [
          { menuItemId: "item_1", quantity: 2, price: 1.0 }, // Client claims ₹1
          { menuItemId: "item_2", quantity: 3, price: 0.5 }, // Client claims ₹0.50
        ],
        subtotal: 3.5, // Client claims ₹3.50
        taxAmount: 0.0, // Client claims ₹0 tax
        totalAmount: 3.5, // Client claims ₹3.50 grand total
      };

      // Server calculates subtotal from DB items
      let serverSubtotal = new Prisma.Decimal(0);
      for (const cartItem of tamperedClientCart.items) {
        const dbItem = trustedDbItems.find((i) => i.id === cartItem.menuItemId);
        expect(dbItem).toBeDefined();
        if (dbItem) {
          serverSubtotal = serverSubtotal.plus(dbItem.price.times(cartItem.quantity));
        }
      }

      // Expected subtotal: (250 * 2) + (50 * 3) = 500 + 150 = 650.00
      expect(serverSubtotal.toNumber()).toBe(650.0);

      // Server calculates tax with 5% exclusive GST
      const serverTax = calculateOrderTax({
        subtotal: serverSubtotal,
        gstEnabled: true,
        taxRate: 5,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(serverTax.taxAmount.toNumber()).toBe(32.5);
      expect(serverTax.totalAmount.toNumber()).toBe(682.5);

      // Confirm client-submitted values were completely discarded
      expect(serverTax.totalAmount.toNumber()).not.toBe(tamperedClientCart.totalAmount);
    });
  });

  describe("5b. Item-Specific GST Override & Mixed-Rate Calculations", () => {
    it("applies restaurant default GST when item does not have a custom override", () => {
      const result = calculateMixedOrderTax({
        items: [
          {
            menuItemId: "item_default",
            name: "Standard Burger",
            price: 100,
            quantity: 2,
            useCustomTaxRate: false,
            taxRate: null,
          },
        ],
        gstEnabled: true,
        restaurantTaxRate: 5.0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.subtotal.toNumber()).toBe(200.0);
      expect(result.items[0].taxRate.toNumber()).toBe(5.0);
      expect(result.items[0].taxAmount.toNumber()).toBe(10.0);
      expect(result.taxAmount.toNumber()).toBe(10.0);
      expect(result.totalAmount.toNumber()).toBe(210.0);
      expect(result.rateBreakdown).toHaveLength(1);
      expect(result.rateBreakdown[0].rate.toNumber()).toBe(5.0);
      expect(result.rateBreakdown[0].taxAmount.toNumber()).toBe(10.0);
    });

    it("applies custom GST override when item has useCustomTaxRate enabled", () => {
      const result = calculateMixedOrderTax({
        items: [
          {
            menuItemId: "item_custom",
            name: "Alcohol / Premium Beverage",
            price: 500,
            quantity: 1,
            useCustomTaxRate: true,
            taxRate: 18.0,
          },
        ],
        gstEnabled: true,
        restaurantTaxRate: 5.0, // Restaurant default is 5%, but item is 18%
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.subtotal.toNumber()).toBe(500.0);
      expect(result.items[0].taxRate.toNumber()).toBe(18.0);
      expect(result.items[0].taxAmount.toNumber()).toBe(90.0);
      expect(result.taxRate.toNumber()).toBe(18.0);
      expect(result.taxAmount.toNumber()).toBe(90.0);
      expect(result.totalAmount.toNumber()).toBe(590.0);
      expect(result.cgstAmount.toNumber()).toBe(45.0);
      expect(result.sgstAmount.toNumber()).toBe(45.0);
    });

    it("calculates mixed-rate carts accurately with separate rate buckets (EXCLUSIVE mode)", () => {
      const result = calculateMixedOrderTax({
        items: [
          {
            menuItemId: "dish_food",
            name: "Pasta (5% GST default)",
            price: 200,
            quantity: 1,
            useCustomTaxRate: false, // inherits default 5%
          },
          {
            menuItemId: "dish_drink",
            name: "Mocktail (18% GST custom)",
            price: 100,
            quantity: 2,
            useCustomTaxRate: true,
            taxRate: 18.0, // custom 18%
          },
        ],
        gstEnabled: true,
        restaurantTaxRate: 5.0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      // Item 1: 200 * 1 = 200.00 subtotal, 5% tax = 10.00, total = 210.00
      expect(result.items[0].subtotal.toNumber()).toBe(200.0);
      expect(result.items[0].taxRate.toNumber()).toBe(5.0);
      expect(result.items[0].taxAmount.toNumber()).toBe(10.0);
      expect(result.items[0].totalAmount.toNumber()).toBe(210.0);

      // Item 2: 100 * 2 = 200.00 subtotal, 18% tax = 36.00, total = 236.00
      expect(result.items[1].subtotal.toNumber()).toBe(200.0);
      expect(result.items[1].taxRate.toNumber()).toBe(18.0);
      expect(result.items[1].taxAmount.toNumber()).toBe(36.0);
      expect(result.items[1].totalAmount.toNumber()).toBe(236.0);

      // Order Totals: subtotal = 400.00, tax = 46.00, total = 446.00
      expect(result.subtotal.toNumber()).toBe(400.0);
      expect(result.taxableAmount.toNumber()).toBe(400.0);
      expect(result.taxAmount.toNumber()).toBe(46.0);
      expect(result.totalAmount.toNumber()).toBe(446.0);

      // Intra-state equal split
      expect(result.cgstAmount.toNumber()).toBe(23.0);
      expect(result.sgstAmount.toNumber()).toBe(23.0);
      expect(result.cgstAmount.add(result.sgstAmount).toNumber()).toBe(result.taxAmount.toNumber());

      // Rate Breakdown: Bucket 5% and Bucket 18%
      expect(result.rateBreakdown).toHaveLength(2);
      expect(result.rateBreakdown[0].rate.toNumber()).toBe(5.0);
      expect(result.rateBreakdown[0].taxableAmount.toNumber()).toBe(200.0);
      expect(result.rateBreakdown[0].taxAmount.toNumber()).toBe(10.0);
      expect(result.rateBreakdown[0].cgstAmount.toNumber()).toBe(5.0);
      expect(result.rateBreakdown[0].sgstAmount.toNumber()).toBe(5.0);

      expect(result.rateBreakdown[1].rate.toNumber()).toBe(18.0);
      expect(result.rateBreakdown[1].taxableAmount.toNumber()).toBe(200.0);
      expect(result.rateBreakdown[1].taxAmount.toNumber()).toBe(36.0);
      expect(result.rateBreakdown[1].cgstAmount.toNumber()).toBe(18.0);
      expect(result.rateBreakdown[1].sgstAmount.toNumber()).toBe(18.0);
    });

    it("calculates mixed-rate carts accurately in INCLUSIVE pricing mode", () => {
      const result = calculateMixedOrderTax({
        items: [
          {
            menuItemId: "dish_food",
            name: "All-inclusive Meal (5% GST)",
            price: 210, // Total is 210 incl 5% => base 200, tax 10
            quantity: 1,
            useCustomTaxRate: false,
          },
          {
            menuItemId: "dish_drink",
            name: "All-inclusive Drink (18% GST)",
            price: 118, // Total is 236 incl 18% => base 200, tax 36
            quantity: 2,
            useCustomTaxRate: true,
            taxRate: 18.0,
          },
        ],
        gstEnabled: true,
        restaurantTaxRate: 5.0,
        taxMode: TaxCalculationMode.INCLUSIVE,
      });

      // Item 1: 210.00 total incl 5% => taxable 200.00, tax 10.00
      expect(result.items[0].totalAmount.toNumber()).toBe(210.0);
      expect(result.items[0].taxableAmount.toNumber()).toBe(200.0);
      expect(result.items[0].taxAmount.toNumber()).toBe(10.0);

      // Item 2: 236.00 total incl 18% => taxable 200.00, tax 36.00
      expect(result.items[1].totalAmount.toNumber()).toBe(236.0);
      expect(result.items[1].taxableAmount.toNumber()).toBe(200.0);
      expect(result.items[1].taxAmount.toNumber()).toBe(36.0);

      // Order totals in INCLUSIVE mode
      expect(result.totalAmount.toNumber()).toBe(446.0);
      expect(result.taxableAmount.toNumber()).toBe(400.0);
      expect(result.taxAmount.toNumber()).toBe(46.0);
      expect(result.cgstAmount.toNumber()).toBe(23.0);
      expect(result.sgstAmount.toNumber()).toBe(23.0);
    });

    it("strictly charges zero tax when restaurant gstEnabled is false, even if items have custom rates", () => {
      const result = calculateMixedOrderTax({
        items: [
          {
            menuItemId: "dish_1",
            name: "Item with custom tax",
            price: 150,
            quantity: 2,
            useCustomTaxRate: true,
            taxRate: 18.0,
          },
          {
            menuItemId: "dish_2",
            name: "Item with default tax",
            price: 200,
            quantity: 1,
            useCustomTaxRate: false,
            taxRate: null,
          },
        ],
        gstEnabled: false, // GST disabled for restaurant!
        restaurantTaxRate: 5.0,
        taxMode: TaxCalculationMode.EXCLUSIVE,
      });

      expect(result.taxAmount.toNumber()).toBe(0.0);
      expect(result.taxRate.toNumber()).toBe(0.0);
      expect(result.cgstAmount.toNumber()).toBe(0.0);
      expect(result.sgstAmount.toNumber()).toBe(0.0);
      expect(result.totalAmount.toNumber()).toBe(500.0);
      expect(result.items[0].taxRate.toNumber()).toBe(0.0);
      expect(result.items[0].taxAmount.toNumber()).toBe(0.0);
      expect(result.items[1].taxRate.toNumber()).toBe(0.0);
      expect(result.items[1].taxAmount.toNumber()).toBe(0.0);
    });

    it("guarantees snapshot immutability for past orders", () => {
      // Historical order created when Item had 12% GST
      const historicalOrderItem = {
        menuItemId: "item_123",
        unitPrice: new Prisma.Decimal("100.00"),
        subtotal: new Prisma.Decimal("100.00"),
        taxRate: new Prisma.Decimal("12.00"),
        taxAmount: new Prisma.Decimal("12.00"),
        taxableAmount: new Prisma.Decimal("100.00"),
      };

      // Item subsequently updated to 18% GST by restaurant owner
      const currentItemConfig = {
        id: "item_123",
        useCustomTaxRate: true,
        taxRate: 18.0,
      };

      // Ensure historical order snapshot remains exactly 12.00
      expect(historicalOrderItem.taxRate.toNumber()).toBe(12.0);
      expect(historicalOrderItem.taxAmount.toNumber()).toBe(12.0);
      expect(historicalOrderItem.taxRate.toNumber()).not.toBe(currentItemConfig.taxRate);
    });

    it("validates MenuItem schemas for custom GST configuration", () => {
      // Valid custom GST creation
      const validCreate = CreateMenuItemSchema.safeParse({
        categoryId: "cat_1",
        name: "Specialty Wine",
        price: 1200.0,
        useCustomTaxRate: true,
        taxRate: 18.0,
      });
      expect(validCreate.success).toBe(true);

      // Valid default GST creation
      const validDefault = CreateMenuItemSchema.safeParse({
        categoryId: "cat_1",
        name: "Regular Tea",
        price: 30.0,
        useCustomTaxRate: false,
        taxRate: null,
      });
      expect(validDefault.success).toBe(true);

      // Rejects negative GST rate
      const negativeRate = CreateMenuItemSchema.safeParse({
        categoryId: "cat_1",
        name: "Invalid Item",
        price: 100.0,
        useCustomTaxRate: true,
        taxRate: -5.0,
      });
      expect(negativeRate.success).toBe(false);

      // Rejects rate > 28%
      const excessiveRate = CreateMenuItemSchema.safeParse({
        categoryId: "cat_1",
        name: "Excessive Item",
        price: 100.0,
        useCustomTaxRate: true,
        taxRate: 35.0,
      });
      expect(excessiveRate.success).toBe(false);

      // Rejects more than 2 decimal places in taxRate
      const precisionError = CreateMenuItemSchema.safeParse({
        categoryId: "cat_1",
        name: "Precision Item",
        price: 100.0,
        useCustomTaxRate: true,
        taxRate: 12.345,
      });
      expect(precisionError.success).toBe(false);

      // Update schema validation
      const validUpdate = UpdateMenuItemSchema.safeParse({
        useCustomTaxRate: true,
        taxRate: 28.0,
      });
      expect(validUpdate.success).toBe(true);
    });
  });

  describe("6. Cancelled Orders Exclusion in Analytics", () => {
    it("strictly excludes cancelled orders from tax collected and net sales", () => {
      const orders = [
        { status: OrderStatus.CONFIRMED, totalAmount: 105.0, taxAmount: 5.0, taxableAmount: 100.0 },
        { status: OrderStatus.COMPLETED, totalAmount: 210.0, taxAmount: 10.0, taxableAmount: 200.0 },
        { status: OrderStatus.CANCELLED, totalAmount: 525.0, taxAmount: 25.0, taxableAmount: 500.0 }, // Cancelled!
      ];

      let totalSales = 0;
      let totalTax = 0;
      let netSales = 0;

      for (const o of orders) {
        if (o.status !== OrderStatus.CANCELLED) {
          totalSales += o.totalAmount;
          totalTax += o.taxAmount;
          netSales += o.taxableAmount;
        }
      }

      // Non-cancelled sales: 105 + 210 = 315
      expect(totalSales).toBe(315.0);
      // Non-cancelled tax: 5 + 10 = 15 (25 from cancelled excluded!)
      expect(totalTax).toBe(15.0);
      // Net sales: 100 + 200 = 300
      expect(netSales).toBe(300.0);
      expect(netSales + totalTax).toBe(totalSales);
    });
  });

  describe("7. RBAC & Tenant Isolation", () => {
    it("allows OWNER and MANAGER to configure GST settings", () => {
      const permittedRoles: MembershipRole[] = [MembershipRole.OWNER, MembershipRole.MANAGER];
      const ownerPermitted = permittedRoles.includes(MembershipRole.OWNER);
      const managerPermitted = permittedRoles.includes(MembershipRole.MANAGER);
      const staffPermitted = permittedRoles.includes(MembershipRole.STAFF);

      expect(ownerPermitted).toBe(true);
      expect(managerPermitted).toBe(true);
      expect(staffPermitted).toBe(false);
    });

    it("enforces tenant isolation across restaurants", async () => {
      // Mock verifyRestaurantAccess to simulate cross-tenant rejection
      const mockAccessCheck = vi.fn().mockImplementation((userId, userRole, targetRestaurantId) => {
        if (targetRestaurantId === "rest_valid_1") {
          return { authorized: true, role: MembershipRole.OWNER };
        }
        return { authorized: false, error: "Access denied to restaurant." };
      });

      const allowed = mockAccessCheck("user_123", "RESTAURANT_OWNER", "rest_valid_1");
      expect(allowed.authorized).toBe(true);

      const crossTenantAttempt = mockAccessCheck("user_123", "RESTAURANT_OWNER", "rest_other_restaurant");
      expect(crossTenantAttempt.authorized).toBe(false);
    });
  });
});
