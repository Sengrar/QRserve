import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess, AuthenticationError, AuthorizationError } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { MembershipRole } from "@prisma/client";
import { AnalyticsDatePreset, isValidDateRange, parseDateInput } from "@/lib/analytics/dates";
import { getRestaurantOrderAnalytics } from "@/lib/analytics/service";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const ALLOWED_PRESETS: AnalyticsDatePreset[] = [
  "today",
  "yesterday",
  "last7days",
  "last30days",
  "thismonth",
  "lastmonth",
  "thisyear",
  "custom",
];

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    // Strict tenant access control: Owner, Manager, or Staff
    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Access denied to restaurant analytics." },
        { status: 403 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Restaurant not found." },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const presetParam = (searchParams.get("preset") || "last7days").toLowerCase() as AnalyticsDatePreset;
    const startDateParam = searchParams.get("startDate");
    const endDateParam = searchParams.get("endDate");

    if (!ALLOWED_PRESETS.includes(presetParam)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_PRESET",
          error: `Invalid date preset. Allowed presets: ${ALLOWED_PRESETS.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (presetParam === "custom") {
      if (!startDateParam || !endDateParam) {
        return NextResponse.json(
          {
            success: false,
            code: "MISSING_CUSTOM_DATES",
            error: "Custom date range requires both startDate and endDate parameters in YYYY-MM-DD format.",
          },
          { status: 400 }
        );
      }

      const parsedStart = parseDateInput(startDateParam, false);
      const parsedEnd = parseDateInput(endDateParam, true);

      if (!parsedStart || !parsedEnd || !isValidDateRange(parsedStart, parsedEnd)) {
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_DATE_RANGE",
            error: "Invalid custom date range. Please ensure start date is on or before end date and range does not exceed 5 years.",
          },
          { status: 400 }
        );
      }
    }

    const analyticsData = await getRestaurantOrderAnalytics(
      restaurant.id,
      presetParam,
      startDateParam,
      endDateParam
    );

    return NextResponse.json({
      success: true,
      data: {
        restaurant: {
          id: restaurant.id,
          name: restaurant.name,
          slug: restaurant.slug,
        },
        ...analyticsData,
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, code: "UNAUTHORIZED", error: error.message },
        { status: error.statusCode }
      );
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/restaurants/[id]/analytics error:", error);
    return NextResponse.json(
      { success: false, code: "INTERNAL_ERROR", error: "Internal server error fetching analytics." },
      { status: 500 }
    );
  }
}
