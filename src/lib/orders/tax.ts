import { Prisma, TaxCalculationMode } from "@prisma/client";

/**
 * Standard 15-character GSTIN format validation regex (India):
 * - 2 digits state code (01-38 or 97/99)
 * - 10 characters PAN (5 letters, 4 digits, 1 letter)
 * - 1 entity code character (1-9 or A-Z)
 * - 'Z' by default
 * - 1 check character (digit or letter)
 */
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

export function isValidGSTIN(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  return GSTIN_REGEX.test(gstin.trim());
}

export interface TaxCalculationParams {
  subtotal: Prisma.Decimal | number | string;
  gstEnabled: boolean;
  taxRate: Prisma.Decimal | number | string;
  taxMode: TaxCalculationMode;
  discountAmount?: Prisma.Decimal | number | string;
}

export interface OrderTaxSnapshot {
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  taxMode: TaxCalculationMode;
  taxableAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  discountAmount?: Prisma.Decimal;
}

export interface TaxLineItem {
  id?: string;
  menuItemId?: string;
  name?: string;
  price: Prisma.Decimal | number | string;
  quantity: number;
  useCustomTaxRate?: boolean;
  taxRate?: Prisma.Decimal | number | string | null;
  notes?: string | null;
}

export interface CalculatedOrderItemTax {
  menuItemId?: string;
  itemName?: string;
  quantity: number;
  unitPrice: Prisma.Decimal;
  subtotal: Prisma.Decimal;
  taxRate: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  totalAmount: Prisma.Decimal;
  notes?: string | null;
}

export interface RateBreakdownBucket {
  rate: Prisma.Decimal;
  taxableAmount: Prisma.Decimal;
  taxAmount: Prisma.Decimal;
  cgstAmount: Prisma.Decimal;
  sgstAmount: Prisma.Decimal;
}

export interface MixedOrderTaxSnapshot extends OrderTaxSnapshot {
  items: CalculatedOrderItemTax[];
  rateBreakdown: RateBreakdownBucket[];
}

export interface MixedTaxCalculationParams {
  items: TaxLineItem[];
  gstEnabled: boolean;
  restaurantTaxRate: Prisma.Decimal | number | string;
  taxMode: TaxCalculationMode;
  discountAmount?: Prisma.Decimal | number | string;
}

/**
 * Helper to round a Decimal to exactly 2 decimal places using half-up arithmetic.
 */
export function roundDecimal(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/**
 * Core Single-Rate Tax Calculation Engine (Backward Compatible)
 */
export function calculateOrderTax(params: TaxCalculationParams): OrderTaxSnapshot {
  const rawSubtotal = new Prisma.Decimal(params.subtotal);
  const subtotal = roundDecimal(rawSubtotal);
  const mode = params.taxMode ?? TaxCalculationMode.EXCLUSIVE;
  const zero = new Prisma.Decimal("0.00");

  let rawDiscount = roundDecimal(new Prisma.Decimal(params.discountAmount || 0));
  if (rawDiscount.lt(0)) rawDiscount = zero;
  const discountAmount = rawDiscount.gt(subtotal) ? subtotal : rawDiscount;

  // Case 1: Restaurant is not GST registered or GST is disabled
  if (!params.gstEnabled) {
    const netTotal = roundDecimal(subtotal.sub(discountAmount));
    return {
      taxRate: zero,
      taxAmount: zero,
      taxMode: mode,
      taxableAmount: netTotal,
      cgstAmount: zero,
      sgstAmount: zero,
      totalAmount: netTotal,
      subtotal,
      discountAmount,
    };
  }

  const rawRate = new Prisma.Decimal(params.taxRate);
  const taxRate = roundDecimal(rawRate);

  // If taxRate is 0 or negative
  if (taxRate.lte(0)) {
    const netTotal = roundDecimal(subtotal.sub(discountAmount));
    return {
      taxRate: zero,
      taxAmount: zero,
      taxMode: mode,
      taxableAmount: netTotal,
      cgstAmount: zero,
      sgstAmount: zero,
      totalAmount: netTotal,
      subtotal,
      discountAmount,
    };
  }

  const oneHundred = new Prisma.Decimal("100");

  if (mode === TaxCalculationMode.INCLUSIVE) {
    const netTotal = roundDecimal(subtotal.sub(discountAmount));
    const divisor = new Prisma.Decimal(1).add(taxRate.div(oneHundred));
    const rawTaxable = netTotal.div(divisor);
    const taxableAmount = roundDecimal(rawTaxable);
    const taxAmount = roundDecimal(netTotal.sub(taxableAmount));
    const totalAmount = netTotal;

    const cgstAmount = roundDecimal(taxAmount.div(2));
    const sgstAmount = roundDecimal(taxAmount.sub(cgstAmount));

    return {
      taxRate,
      taxAmount,
      taxMode: TaxCalculationMode.INCLUSIVE,
      taxableAmount,
      cgstAmount,
      sgstAmount,
      totalAmount,
      subtotal,
      discountAmount,
    };
  }

  // EXCLUSIVE mode (default):
  // Discount reduces taxable amount before calculating tax
  const taxableAmount = roundDecimal(subtotal.sub(discountAmount));
  const rawTax = taxableAmount.mul(taxRate).div(oneHundred);
  const taxAmount = roundDecimal(rawTax);
  const totalAmount = roundDecimal(taxableAmount.add(taxAmount));

  const cgstAmount = roundDecimal(taxAmount.div(2));
  const sgstAmount = roundDecimal(taxAmount.sub(cgstAmount));

  return {
    taxRate,
    taxAmount,
    taxMode: TaxCalculationMode.EXCLUSIVE,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    totalAmount,
    subtotal,
    discountAmount,
  };
}

/**
 * Authoritative Server-Side Mixed Tax Calculation Engine
 *
 * Supports restaurant default GST combined with optional individual item GST overrides.
 * Computes per-item tax snapshot (taxRate, taxableAmount, taxAmount) with 2-decimal rounding.
 * Apportions coupon discount proportionally across line items before applying tax.
 * Aggregates order-level totals and produces rate breakdown buckets.
 */
export function calculateMixedOrderTax(params: MixedTaxCalculationParams): MixedOrderTaxSnapshot {
  const mode = params.taxMode ?? TaxCalculationMode.EXCLUSIVE;
  const zero = new Prisma.Decimal("0.00");
  const oneHundred = new Prisma.Decimal("100");

  const defaultRestaurantRate = params.gstEnabled
    ? roundDecimal(new Prisma.Decimal(params.restaurantTaxRate || 0))
    : zero;

  // First pass: compute raw line subtotals & rates
  const rawLineItems = params.items.map((item) => {
    const rawUnitPrice = new Prisma.Decimal(item.price);
    const unitPrice = roundDecimal(rawUnitPrice);
    const qty = Math.max(1, Math.floor(item.quantity));
    const lineSubtotal = roundDecimal(unitPrice.mul(qty));

    let appliedRate = zero;
    if (params.gstEnabled) {
      if (item.useCustomTaxRate && item.taxRate !== null && item.taxRate !== undefined) {
        const customRate = roundDecimal(new Prisma.Decimal(item.taxRate));
        appliedRate = customRate.gte(0) ? customRate : zero;
      } else {
        appliedRate = defaultRestaurantRate.gte(0) ? defaultRestaurantRate : zero;
      }
    }

    return {
      item,
      unitPrice,
      qty,
      lineSubtotal,
      appliedRate,
    };
  });

  const totalGrossSubtotal = rawLineItems.reduce(
    (acc, cur) => acc.add(cur.lineSubtotal),
    zero
  );

  // Discount calculation
  let requestedDiscount = roundDecimal(new Prisma.Decimal(params.discountAmount || 0));
  if (requestedDiscount.lt(0)) requestedDiscount = zero;
  const totalDiscount = requestedDiscount.gt(totalGrossSubtotal)
    ? totalGrossSubtotal
    : requestedDiscount;

  // Apportion discount across line items proportionally
  let remainingDiscountToDistribute = totalDiscount;
  let totalTaxableAmount = zero;
  let totalTaxAmount = zero;
  let grandTotal = zero;

  const calculatedItems: CalculatedOrderItemTax[] = [];
  const rateBuckets = new Map<string, {
    rate: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    taxAmount: Prisma.Decimal;
  }>();

  for (let idx = 0; idx < rawLineItems.length; idx++) {
    const { item, unitPrice, qty, lineSubtotal, appliedRate } = rawLineItems[idx];
    const isLast = idx === rawLineItems.length - 1;

    let lineDiscount = zero;
    if (totalDiscount.gt(0) && totalGrossSubtotal.gt(0)) {
      if (isLast) {
        lineDiscount = remainingDiscountToDistribute;
      } else {
        lineDiscount = roundDecimal(totalDiscount.mul(lineSubtotal).div(totalGrossSubtotal));
        if (lineDiscount.gt(remainingDiscountToDistribute)) {
          lineDiscount = remainingDiscountToDistribute;
        }
        remainingDiscountToDistribute = remainingDiscountToDistribute.sub(lineDiscount);
      }
    }

    let lineTaxableAmount: Prisma.Decimal;
    let lineTaxAmount: Prisma.Decimal;
    let lineTotalAmount: Prisma.Decimal;

    if (mode === TaxCalculationMode.INCLUSIVE) {
      // Menu prices already include tax.
      // Net Line Total = lineSubtotal - lineDiscount
      const lineNetTotal = roundDecimal(lineSubtotal.sub(lineDiscount));
      lineTotalAmount = lineNetTotal;

      if (appliedRate.gt(0)) {
        const divisor = new Prisma.Decimal(1).add(appliedRate.div(oneHundred));
        lineTaxableAmount = roundDecimal(lineTotalAmount.div(divisor));
        lineTaxAmount = roundDecimal(lineTotalAmount.sub(lineTaxableAmount));
      } else {
        lineTaxableAmount = lineTotalAmount;
        lineTaxAmount = zero;
      }
    } else {
      // EXCLUSIVE mode (default):
      // Discount reduces taxable amount before calculating tax
      lineTaxableAmount = roundDecimal(lineSubtotal.sub(lineDiscount));

      if (appliedRate.gt(0)) {
        lineTaxAmount = roundDecimal(lineTaxableAmount.mul(appliedRate).div(oneHundred));
      } else {
        lineTaxAmount = zero;
      }
      lineTotalAmount = roundDecimal(lineTaxableAmount.add(lineTaxAmount));
    }

    totalTaxableAmount = totalTaxableAmount.add(lineTaxableAmount);
    totalTaxAmount = totalTaxAmount.add(lineTaxAmount);
    grandTotal = grandTotal.add(lineTotalAmount);

    calculatedItems.push({
      menuItemId: item.menuItemId || item.id,
      itemName: item.name,
      quantity: qty,
      unitPrice,
      subtotal: lineSubtotal,
      taxRate: appliedRate,
      taxAmount: lineTaxAmount,
      taxableAmount: lineTaxableAmount,
      totalAmount: lineTotalAmount,
      notes: item.notes || null,
    });

    // Aggregate into rate bucket
    const rateKey = appliedRate.toFixed(2);
    const existingBucket = rateBuckets.get(rateKey) || {
      rate: appliedRate,
      taxableAmount: zero,
      taxAmount: zero,
    };

    existingBucket.taxableAmount = existingBucket.taxableAmount.add(lineTaxableAmount);
    existingBucket.taxAmount = existingBucket.taxAmount.add(lineTaxAmount);
    rateBuckets.set(rateKey, existingBucket);
  }

  // CGST / SGST split with exact reconciliation
  const cgstAmount = roundDecimal(totalTaxAmount.div(2));
  const sgstAmount = roundDecimal(totalTaxAmount.sub(cgstAmount));

  // Determine effective order-level tax rate
  let orderTaxRate = defaultRestaurantRate;
  if (!params.gstEnabled) {
    orderTaxRate = zero;
  } else if (params.items.length === 0) {
    orderTaxRate = defaultRestaurantRate;
  } else {
    // If all items have the same rate, use that rate
    const uniqueRates = Array.from(rateBuckets.keys());
    if (uniqueRates.length === 1) {
      orderTaxRate = rateBuckets.get(uniqueRates[0])!.rate;
    } else if (totalTaxableAmount.gt(0)) {
      // Blended effective rate
      orderTaxRate = roundDecimal(totalTaxAmount.mul(oneHundred).div(totalTaxableAmount));
    }
  }

  // Build sorted rate breakdown buckets
  const rateBreakdown: RateBreakdownBucket[] = Array.from(rateBuckets.values())
    .sort((a, b) => a.rate.comparedTo(b.rate))
    .map((bucket) => {
      const bCgst = roundDecimal(bucket.taxAmount.div(2));
      const bSgst = roundDecimal(bucket.taxAmount.sub(bCgst));
      return {
        rate: bucket.rate,
        taxableAmount: bucket.taxableAmount,
        taxAmount: bucket.taxAmount,
        cgstAmount: bCgst,
        sgstAmount: bSgst,
      };
    });

  return {
    taxRate: orderTaxRate,
    taxAmount: totalTaxAmount,
    taxMode: mode,
    taxableAmount: totalTaxableAmount,
    cgstAmount,
    sgstAmount,
    totalAmount: grandTotal,
    subtotal: totalGrossSubtotal,
    discountAmount: totalDiscount,
    items: calculatedItems,
    rateBreakdown,
  };
}

