import { prisma } from "@/lib/db/prisma";
import { OrderStatus } from "@prisma/client";
import {
  AnalyticsDatePreset,
  resolveDateRange,
  DateRange,
  getZonedDateParts,
  createZonedStartOfDay,
  createZonedEndOfDay,
} from "./dates";

export interface StatusBreakdown {
  status: OrderStatus;
  label: string;
  count: number;
  orderValue: number;
  taxAmount: number;
  netSales: number;
  revenue: number;
}

export interface SummaryCardMetric {
  ordersCount: number;
  sales: number;
  taxAmount: number;
  netSales: number;
  completedOrders: number;
  completedSales: number;
  cancelledOrders: number;
  totalDiscount?: number;
  // Aliases for compatibility
  orderCount: number;
  revenue: number;
  completedRevenue: number;
  totalOrders: number;
  totalOrderValue: number;
  completedOrderValue: number;
}

export interface ChartDataPoint {
  key: string;
  label: string;
  orderCount: number;
  sales: number;
  completedSales: number;
  cancelledCount: number;
  // Aliases for compatibility
  totalOrderValue: number;
  completedOrderValue: number;
  revenue: number;
  completedRevenue: number;
}

export interface OrderAnalyticsResult {
  summary: {
    today: SummaryCardMetric;
    thisMonth: SummaryCardMetric;
    thisYear: SummaryCardMetric;
  };
  filter: {
    preset: AnalyticsDatePreset;
    label: string;
    startDate: string;
    endDate: string;
  };
  periodTotals: {
    totalOrders: number;
    totalSales: number;
    totalTaxAmount: number;
    netSales: number;
    completedOrders: number;
    completedSales: number;
    cancelledOrders: number;
    nonCancelledOrders: number;
    averageOrderValue: number;
    totalDiscountAmount: number;
    couponOrdersCount: number;
    // Compatibility aliases
    totalOrderValue: number;
    completedOrderValue: number;
    grossOrderValue: number;
    completedRevenue: number;
  };
  statusBreakdown: StatusBreakdown[];
  charts: {
    daily: ChartDataPoint[];
    monthly: ChartDataPoint[];
    yearly: ChartDataPoint[];
  };
  topCoupons?: Array<{ code: string; count: number; totalDiscount: number }>;
}

/**
 * Status display metadata
 */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  SUBMITTED: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  SERVED: "Served",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Aggregates order count and sales for a specific restaurant and time window.
 *
 * Cash-at-Counter Sales Rules:
 * 1. Sales are calculated using authoritative server-side database amounts.
 * 2. Cancelled orders (CANCELLED) are strictly excluded from all sales calculations.
 * 3. Total Sales represent all valid orders placed (excluding cancellations).
 * 4. Completed Sales represent fulfilled dining orders (status: COMPLETED).
 * 5. No payment-pending workflow is tracked in this cash-at-counter model.
 */
async function aggregateMetricsForRange(
  restaurantId: string,
  startDate: Date,
  endDate: Date
): Promise<SummaryCardMetric> {
  const groups = await prisma.order.groupBy({
    by: ["status"],
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { _all: true },
    _sum: { totalAmount: true, taxAmount: true, taxableAmount: true, discountAmount: true },
  });

  let ordersCount = 0;
  let completedOrders = 0;
  let sales = 0;
  let taxAmount = 0;
  let netSales = 0;
  let completedSales = 0;
  let cancelledOrders = 0;
  let totalDiscount = 0;

  for (const group of groups) {
    const count = group._count._all;
    const amount = group._sum.totalAmount ? Number(group._sum.totalAmount) : 0;
    const tax = group._sum.taxAmount ? Number(group._sum.taxAmount) : 0;
    const taxable = group._sum.taxableAmount ? Number(group._sum.taxableAmount) : 0;
    const discount = group._sum.discountAmount ? Number(group._sum.discountAmount) : 0;
    ordersCount += count;

    if (group.status === OrderStatus.CANCELLED) {
      cancelledOrders += count;
    } else {
      // Exclude cancelled orders from sales, tax, and discount
      sales += amount;
      taxAmount += tax;
      netSales += taxable > 0 ? taxable : (amount - tax);
      totalDiscount += discount;
    }

    if (group.status === OrderStatus.COMPLETED) {
      completedOrders += count;
      completedSales += amount;
    }
  }

  const roundedSales = Number(sales.toFixed(2));
  const roundedTaxAmount = Number(taxAmount.toFixed(2));
  const roundedNetSales = Number(netSales.toFixed(2));
  const roundedCompletedSales = Number(completedSales.toFixed(2));
  const roundedDiscount = Number(totalDiscount.toFixed(2));

  return {
    ordersCount,
    sales: roundedSales,
    taxAmount: roundedTaxAmount,
    netSales: roundedNetSales,
    completedOrders,
    completedSales: roundedCompletedSales,
    cancelledOrders,
    totalDiscount: roundedDiscount,
    // Aliases
    orderCount: ordersCount,
    revenue: roundedSales,
    completedRevenue: roundedCompletedSales,
    totalOrders: ordersCount,
    totalOrderValue: roundedSales,
    completedOrderValue: roundedCompletedSales,
  };
}

/**
 * Fetches status breakdown for a restaurant within a specific time window
 */
async function fetchStatusBreakdown(
  restaurantId: string,
  startDate: Date,
  endDate: Date
): Promise<StatusBreakdown[]> {
  const groups = await prisma.order.groupBy({
    by: ["status"],
    where: {
      restaurantId,
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    },
    _count: { _all: true },
    _sum: { totalAmount: true, taxAmount: true, taxableAmount: true },
  });

  const resultMap = new Map<
    OrderStatus,
    { count: number; orderValue: number; taxAmount: number; netSales: number }
  >();

  // Initialize all known OrderStatus enums with zero
  for (const status of Object.values(OrderStatus)) {
    resultMap.set(status, { count: 0, orderValue: 0, taxAmount: 0, netSales: 0 });
  }

  for (const group of groups) {
    const count = group._count._all;
    const amount = group._sum.totalAmount ? Number(group._sum.totalAmount) : 0;
    const tax = group._sum.taxAmount ? Number(group._sum.taxAmount) : 0;
    const taxable = group._sum.taxableAmount ? Number(group._sum.taxableAmount) : 0;
    // Exclude cancelled orders from order values & tax
    const isCancelled = group.status === OrderStatus.CANCELLED;
    const orderValue = isCancelled ? 0 : amount;
    const appliedTax = isCancelled ? 0 : tax;
    const appliedNet = isCancelled ? 0 : (taxable > 0 ? taxable : (amount - tax));

    resultMap.set(group.status, {
      count,
      orderValue: Number(orderValue.toFixed(2)),
      taxAmount: Number(appliedTax.toFixed(2)),
      netSales: Number(appliedNet.toFixed(2)),
    });
  }

  const displayOrder: OrderStatus[] = [
    OrderStatus.SUBMITTED,
    OrderStatus.CONFIRMED,
    OrderStatus.PREPARING,
    OrderStatus.SERVED,
    OrderStatus.COMPLETED,
    OrderStatus.CANCELLED,
  ];

  return displayOrder.map((status) => {
    const entry = resultMap.get(status);
    const count = entry?.count ?? 0;
    const orderValue = entry?.orderValue ?? 0;
    const taxAmount = entry?.taxAmount ?? 0;
    const netSales = entry?.netSales ?? 0;
    return {
      status,
      label: ORDER_STATUS_LABELS[status],
      count,
      orderValue,
      taxAmount,
      netSales,
      revenue: orderValue,
    };
  });
}

/**
 * Builds responsive daily, monthly, and yearly chart aggregations
 */
async function buildChartBuckets(
  restaurantId: string,
  filterRange: DateRange,
  referenceDate: Date = new Date()
): Promise<{
  daily: ChartDataPoint[];
  monthly: ChartDataPoint[];
  yearly: ChartDataPoint[];
}> {
  const now = getZonedDateParts(referenceDate);
  const endOfYear = createZonedEndOfDay(now.year, 12, 31);
  const pastYears = [now.year - 2, now.year - 1, now.year];
  const startOfHistorical = createZonedStartOfDay(pastYears[0], 1, 1);

  // Parallelize filtered range orders and historical orders (historical covers the past 3 years including current year)
  const [filteredOrders, historicalOrders] = await Promise.all([
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: filterRange.startDate,
          lte: filterRange.endDate,
        },
      },
      select: {
        id: true,
        status: true,
        totalAmount: true,
        createdAt: true,
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.order.findMany({
      where: {
        restaurantId,
        createdAt: {
          gte: startOfHistorical,
          lte: endOfYear,
        },
      },
      select: {
        status: true,
        totalAmount: true,
        createdAt: true,
      },
    }),
  ]);

  const dailyMap = new Map<string, ChartDataPoint>();

  const spanMs = filterRange.endDate.getTime() - filterRange.startDate.getTime();
  const spanDays = Math.min(Math.ceil(spanMs / (24 * 60 * 60 * 1000)), 62);

  for (let i = 0; i <= spanDays; i++) {
    const cur = new Date(filterRange.startDate.getTime() + i * 24 * 60 * 60 * 1000);
    if (cur > filterRange.endDate) break;
    const parts = getZonedDateParts(cur);
    const key = `${parts.year}-${parts.month < 10 ? `0${parts.month}` : parts.month}-${parts.day < 10 ? `0${parts.day}` : parts.day}`;
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const label = `${parts.day} ${monthNames[parts.month - 1]}`;

    if (!dailyMap.has(key)) {
      dailyMap.set(key, {
        key,
        label,
        orderCount: 0,
        sales: 0,
        completedSales: 0,
        cancelledCount: 0,
        totalOrderValue: 0,
        completedOrderValue: 0,
        revenue: 0,
        completedRevenue: 0,
      });
    }
  }

  for (const o of filteredOrders) {
    const parts = getZonedDateParts(o.createdAt);
    const key = `${parts.year}-${parts.month < 10 ? `0${parts.month}` : parts.month}-${parts.day < 10 ? `0${parts.day}` : parts.day}`;
    let point = dailyMap.get(key);
    if (!point) {
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      point = {
        key,
        label: `${parts.day} ${monthNames[parts.month - 1]}`,
        orderCount: 0,
        sales: 0,
        completedSales: 0,
        cancelledCount: 0,
        totalOrderValue: 0,
        completedOrderValue: 0,
        revenue: 0,
        completedRevenue: 0,
      };
      dailyMap.set(key, point);
    }

    point.orderCount += 1;
    const amount = Number(o.totalAmount);
    if (o.status !== OrderStatus.CANCELLED) {
      point.sales = Number((point.sales + amount).toFixed(2));
      point.totalOrderValue = point.sales;
      point.revenue = point.sales;
    } else {
      point.cancelledCount += 1;
    }
    if (o.status === OrderStatus.COMPLETED) {
      point.completedSales = Number((point.completedSales + amount).toFixed(2));
      point.completedOrderValue = point.completedSales;
      point.completedRevenue = point.completedSales;
    }
  }

  const daily = Array.from(dailyMap.values()).sort((a, b) => a.key.localeCompare(b.key));

  // 2. Monthly chart: All months of current year (computed from historicalOrders)
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthlyMap = new Map<string, ChartDataPoint>();

  for (let m = 1; m <= 12; m++) {
    const key = `${now.year}-${m < 10 ? `0${m}` : m}`;
    monthlyMap.set(key, {
      key,
      label: monthNames[m - 1],
      orderCount: 0,
      sales: 0,
      completedSales: 0,
      cancelledCount: 0,
      totalOrderValue: 0,
      completedOrderValue: 0,
      revenue: 0,
      completedRevenue: 0,
    });
  }

  // 3. Yearly chart: Past 3 years (computed from historicalOrders)
  const yearlyMap = new Map<string, ChartDataPoint>();
  for (const yr of pastYears) {
    yearlyMap.set(yr.toString(), {
      key: yr.toString(),
      label: yr.toString(),
      orderCount: 0,
      sales: 0,
      completedSales: 0,
      cancelledCount: 0,
      totalOrderValue: 0,
      completedOrderValue: 0,
      revenue: 0,
      completedRevenue: 0,
    });
  }

  for (const o of historicalOrders) {
    const parts = getZonedDateParts(o.createdAt);
    const amount = Number(o.totalAmount);

    // Update monthly map if within current year
    if (parts.year === now.year) {
      const monthKey = `${parts.year}-${parts.month < 10 ? `0${parts.month}` : parts.month}`;
      const mPoint = monthlyMap.get(monthKey);
      if (mPoint) {
        mPoint.orderCount += 1;
        if (o.status !== OrderStatus.CANCELLED) {
          mPoint.sales = Number((mPoint.sales + amount).toFixed(2));
          mPoint.totalOrderValue = mPoint.sales;
          mPoint.revenue = mPoint.sales;
        } else {
          mPoint.cancelledCount += 1;
        }
        if (o.status === OrderStatus.COMPLETED) {
          mPoint.completedSales = Number((mPoint.completedSales + amount).toFixed(2));
          mPoint.completedOrderValue = mPoint.completedSales;
          mPoint.completedRevenue = mPoint.completedSales;
        }
      }
    }

    // Update yearly map
    const yPoint = yearlyMap.get(parts.year.toString());
    if (yPoint) {
      yPoint.orderCount += 1;
      if (o.status !== OrderStatus.CANCELLED) {
        yPoint.sales = Number((yPoint.sales + amount).toFixed(2));
        yPoint.totalOrderValue = yPoint.sales;
        yPoint.revenue = yPoint.sales;
      } else {
        yPoint.cancelledCount += 1;
      }
      if (o.status === OrderStatus.COMPLETED) {
        yPoint.completedSales = Number((yPoint.completedSales + amount).toFixed(2));
        yPoint.completedOrderValue = yPoint.completedSales;
        yPoint.completedRevenue = yPoint.completedSales;
      }
    }
  }

  const monthly = Array.from(monthlyMap.values());
  const yearly = Array.from(yearlyMap.values());

  return { daily, monthly, yearly };
}

/**
 * Main Service Function: Retrieves complete restaurant order analytics
 * for a cash-at-counter business model with clean order volume and sales figures.
 */
export async function getRestaurantOrderAnalytics(
  restaurantId: string,
  preset: AnalyticsDatePreset = "last7days",
  customStart?: string | null,
  customEnd?: string | null,
  referenceDate: Date = new Date()
): Promise<OrderAnalyticsResult> {
  const todayRange = resolveDateRange("today", null, null, referenceDate);
  const thisMonthRange = resolveDateRange("thismonth", null, null, referenceDate);
  const thisYearRange = resolveDateRange("thisyear", null, null, referenceDate);

  const filterRange = resolveDateRange(preset, customStart, customEnd, referenceDate);

  const [todaySummary, thisMonthSummary, thisYearSummary, statusBreakdown, charts, couponOrders] =
    await Promise.all([
      aggregateMetricsForRange(restaurantId, todayRange.startDate, todayRange.endDate),
      aggregateMetricsForRange(restaurantId, thisMonthRange.startDate, thisMonthRange.endDate),
      aggregateMetricsForRange(restaurantId, thisYearRange.startDate, thisYearRange.endDate),
      fetchStatusBreakdown(restaurantId, filterRange.startDate, filterRange.endDate),
      buildChartBuckets(restaurantId, filterRange, referenceDate),
      prisma.order.findMany({
        where: {
          restaurantId,
          status: { not: OrderStatus.CANCELLED },
          discountAmount: { gt: 0 },
          createdAt: {
            gte: filterRange.startDate,
            lte: filterRange.endDate,
          },
        },
        select: {
          couponCode: true,
          discountAmount: true,
        },
      }),
    ]);

  let totalOrders = 0;
  let completedOrders = 0;
  let cancelledOrders = 0;
  let nonCancelledOrders = 0;
  let totalSales = 0;
  let totalTaxAmount = 0;
  let netSales = 0;
  let completedSales = 0;

  for (const sb of statusBreakdown) {
    totalOrders += sb.count;
    if (sb.status === OrderStatus.CANCELLED) {
      cancelledOrders += sb.count;
    } else {
      nonCancelledOrders += sb.count;
      totalSales += sb.orderValue;
      totalTaxAmount += sb.taxAmount;
      netSales += sb.netSales;
    }
    if (sb.status === OrderStatus.COMPLETED) {
      completedOrders += sb.count;
      completedSales += sb.orderValue;
    }
  }

  const roundedTotalSales = Number(totalSales.toFixed(2));
  const roundedTotalTax = Number(totalTaxAmount.toFixed(2));
  const roundedNetSales = Number(netSales.toFixed(2));
  const roundedCompletedSales = Number(completedSales.toFixed(2));

  const averageOrderValue =
    nonCancelledOrders > 0
      ? Number((totalSales / nonCancelledOrders).toFixed(2))
      : 0;

  // Coupon performance in selected filter period
  let periodTotalDiscount = 0;
  const couponStatsMap = new Map<string, { code: string; count: number; totalDiscount: number }>();
  for (const o of couponOrders) {
    const d = Number(o.discountAmount || 0);
    periodTotalDiscount += d;
    const code = o.couponCode || "COUPON";
    const existing = couponStatsMap.get(code) || { code, count: 0, totalDiscount: 0 };
    existing.count += 1;
    existing.totalDiscount += d;
    couponStatsMap.set(code, existing);
  }

  const topCoupons = Array.from(couponStatsMap.values())
    .sort((a, b) => b.totalDiscount - a.totalDiscount)
    .slice(0, 5)
    .map((c) => ({
      code: c.code,
      count: c.count,
      totalDiscount: Number(c.totalDiscount.toFixed(2)),
    }));

  return {
    summary: {
      today: todaySummary,
      thisMonth: thisMonthSummary,
      thisYear: thisYearSummary,
    },
    filter: {
      preset: filterRange.preset,
      label: filterRange.label,
      startDate: filterRange.startDate.toISOString(),
      endDate: filterRange.endDate.toISOString(),
    },
    periodTotals: {
      totalOrders,
      totalSales: roundedTotalSales,
      totalTaxAmount: roundedTotalTax,
      netSales: roundedNetSales,
      completedOrders,
      completedSales: roundedCompletedSales,
      cancelledOrders,
      nonCancelledOrders,
      averageOrderValue,
      totalDiscountAmount: Number(periodTotalDiscount.toFixed(2)),
      couponOrdersCount: couponOrders.length,
      // Compatibility aliases
      totalOrderValue: roundedTotalSales,
      completedOrderValue: roundedCompletedSales,
      grossOrderValue: roundedTotalSales,
      completedRevenue: roundedCompletedSales,
    },
    statusBreakdown,
    charts,
    topCoupons,
  };
}
