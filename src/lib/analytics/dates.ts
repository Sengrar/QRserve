/**
 * Timezone and Date Range Utilities for QRServe Order Analytics
 *
 * Operational Dining Timezone:
 * QRServe operates in standard Indian Standard Time (IST / Asia/Kolkata, UTC+05:30)
 * by default for dining and billing operations, as menu prices and receipts are in INR (₹).
 * Timezone can be overridden via RESTAURANT_TIMEZONE or DEFAULT_TIMEZONE environment variable.
 */

export const OPERATIONAL_TIMEZONE =
  process.env.RESTAURANT_TIMEZONE || process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

export const TIMEZONE_OFFSET_HOURS = 5.5; // UTC+05:30 for Asia/Kolkata

export type AnalyticsDatePreset =
  | "today"
  | "yesterday"
  | "last7days"
  | "last30days"
  | "thismonth"
  | "lastmonth"
  | "thisyear"
  | "custom";

export interface DateRange {
  startDate: Date;
  endDate: Date;
  preset: AnalyticsDatePreset;
  label: string;
}

/**
 * Returns formatted two-digit number string
 */
function pad(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

/**
 * Extracts calendar date parts (year, month, day) in the configured operational timezone
 */
export function getZonedDateParts(
  date: Date = new Date(),
  timeZone: string = OPERATIONAL_TIMEZONE
): { year: number; month: number; day: number; hour: number; minute: number } {
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
    const parts = formatter.formatToParts(date);
    const getVal = (type: string) => {
      const p = parts.find((pt) => pt.type === type);
      return p ? parseInt(p.value, 10) : 0;
    };
    return {
      year: getVal("year"),
      month: getVal("month"), // 1-12
      day: getVal("day"),
      hour: getVal("hour"),
      minute: getVal("minute"),
    };
  } catch {
    // Fallback to UTC if timezone name is unrecognized
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
    };
  }
}

/**
 * Constructs a Date corresponding to the start of day (00:00:00.000)
 * in the operational timezone.
 */
export function createZonedStartOfDay(year: number, month: number, day: number): Date {
  // Construct ISO string with explicit IST +05:30 offset
  const iso = `${year}-${pad(month)}-${pad(day)}T00:00:00.000+05:30`;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d;
  // Fallback
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Constructs a Date corresponding to the end of day (23:59:59.999)
 * in the operational timezone.
 */
export function createZonedEndOfDay(year: number, month: number, day: number): Date {
  const iso = `${year}-${pad(month)}-${pad(day)}T23:59:59.999+05:30`;
  const d = new Date(iso);
  if (!isNaN(d.getTime())) return d;
  return new Date(Date.UTC(year, month - 1, day, 23, 59, 59, 999));
}

/**
 * Calculates start and end Date boundaries for any supported analytics preset
 */
export function resolveDateRange(
  preset: AnalyticsDatePreset,
  customStart?: string | null,
  customEnd?: string | null,
  referenceDate: Date = new Date()
): DateRange {
  const now = getZonedDateParts(referenceDate);

  switch (preset) {
    case "today": {
      const startDate = createZonedStartOfDay(now.year, now.month, now.day);
      const endDate = createZonedEndOfDay(now.year, now.month, now.day);
      return { startDate, endDate, preset, label: "Today" };
    }

    case "yesterday": {
      // Step back 1 day
      const ref = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
      const y = getZonedDateParts(ref);
      const startDate = createZonedStartOfDay(y.year, y.month, y.day);
      const endDate = createZonedEndOfDay(y.year, y.month, y.day);
      return { startDate, endDate, preset, label: "Yesterday" };
    }

    case "last7days": {
      const refStart = new Date(referenceDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startParts = getZonedDateParts(refStart);
      const startDate = createZonedStartOfDay(startParts.year, startParts.month, startParts.day);
      const endDate = createZonedEndOfDay(now.year, now.month, now.day);
      return { startDate, endDate, preset, label: "Last 7 Days" };
    }

    case "last30days": {
      const refStart = new Date(referenceDate.getTime() - 29 * 24 * 60 * 60 * 1000);
      const startParts = getZonedDateParts(refStart);
      const startDate = createZonedStartOfDay(startParts.year, startParts.month, startParts.day);
      const endDate = createZonedEndOfDay(now.year, now.month, now.day);
      return { startDate, endDate, preset, label: "Last 30 Days" };
    }

    case "thismonth": {
      const startDate = createZonedStartOfDay(now.year, now.month, 1);
      const endDate = createZonedEndOfDay(now.year, now.month, now.day);
      return { startDate, endDate, preset, label: "This Month" };
    }

    case "lastmonth": {
      let lastMonthYear = now.year;
      let lastMonth = now.month - 1;
      if (lastMonth < 1) {
        lastMonth = 12;
        lastMonthYear -= 1;
      }
      // Last day of previous month
      const daysInLastMonth = new Date(Date.UTC(lastMonthYear, lastMonth, 0)).getUTCDate();
      const startDate = createZonedStartOfDay(lastMonthYear, lastMonth, 1);
      const endDate = createZonedEndOfDay(lastMonthYear, lastMonth, daysInLastMonth);
      return { startDate, endDate, preset, label: "Last Month" };
    }

    case "thisyear": {
      const startDate = createZonedStartOfDay(now.year, 1, 1);
      const endDate = createZonedEndOfDay(now.year, now.month, now.day);
      return { startDate, endDate, preset, label: "This Year" };
    }

    case "custom": {
      if (!customStart || !customEnd) {
        // Fall back to last 7 days if custom inputs missing
        return resolveDateRange("last7days", null, null, referenceDate);
      }

      const parsedStart = parseDateInput(customStart, false);
      const parsedEnd = parseDateInput(customEnd, true);

      if (!parsedStart || !parsedEnd || parsedStart > parsedEnd) {
        throw new Error("Invalid custom date range. Start date must be on or before end date.");
      }

      return {
        startDate: parsedStart,
        endDate: parsedEnd,
        preset: "custom",
        label: `${customStart} to ${customEnd}`,
      };
    }

    default:
      return resolveDateRange("last7days", null, null, referenceDate);
  }
}

/**
 * Safely parses YYYY-MM-DD string into zoned start/end date
 */
export function parseDateInput(input: string, isEndOfDay: boolean): Date | null {
  if (!input || typeof input !== "string") return null;
  const match = input.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return null;

  const year = parseInt(match[1], 10);
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return isEndOfDay
    ? createZonedEndOfDay(year, month, day)
    : createZonedStartOfDay(year, month, day);
}

/**
 * Validates that date inputs are safe and within acceptable boundaries
 */
export function isValidDateRange(startDate: Date, endDate: Date): boolean {
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return false;
  if (startDate > endDate) return false;

  // Maximum allowed range: 5 years
  const fiveYearsMs = 5 * 365.25 * 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() > fiveYearsMs) return false;

  return true;
}

/**
 * Format currency in Indian Rupees (₹)
 */
export function formatCurrencyINR(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safeAmount);
}

/**
 * Format compact currency for chart labels (e.g. ₹1.2k)
 */
export function formatCompactINR(amount: number): string {
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  if (safeAmount >= 10000000) {
    return `₹${(safeAmount / 10000000).toFixed(1)}Cr`;
  }
  if (safeAmount >= 100000) {
    return `₹${(safeAmount / 100000).toFixed(1)}L`;
  }
  if (safeAmount >= 1000) {
    return `₹${(safeAmount / 1000).toFixed(1)}k`;
  }
  return `₹${safeAmount.toFixed(0)}`;
}
