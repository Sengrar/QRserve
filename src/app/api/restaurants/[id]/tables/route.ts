import { NextResponse } from "next/server";
import { TableStatus } from "@prisma/client";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { CreateTableSchema } from "@/lib/validations/table";
import { assertCanAddTable, getTableUsageMetrics } from "@/lib/subscription/limits";
import { generateTableQrToken, buildTableQrUrl } from "@/lib/qr";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { slug: true },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const [rawTables, usage] = await Promise.all([
      prisma.table.findMany({
        where: { restaurantId },
        orderBy: [{ tableNumber: "asc" }],
      }),
      getTableUsageMetrics(restaurantId),
    ]);

    // Backfill any table lacking a secure qrToken
    const tables = await Promise.all(
      rawTables.map(async (t) => {
        if (!t.qrToken) {
          const qrToken = generateTableQrToken();
          const qrCodeUrl = buildTableQrUrl(restaurant.slug, qrToken);
          return prisma.table.update({
            where: { id: t.id },
            data: { qrToken, qrCodeUrl },
          });
        }
        return t;
      })
    );

    return NextResponse.json({
      success: true,
      data: {
        tables,
        usage,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/tables error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch tables." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const json = await request.json();
    const validation = CreateTableSchema.safeParse(json);

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { tableNumber, name, status, isActive } = validation.data;

    // Strict Server-Side Subscription & Table Limit Guard:
    // Adding an active table requires subscription check and available allowance
    const willBeActive = isActive !== false && status !== TableStatus.INACTIVE;
    if (willBeActive) {
      await assertCanAddTable(restaurantId);
    }

    // Check uniqueness of table number for this restaurant
    const existingTable = await prisma.table.findUnique({
      where: {
        restaurantId_tableNumber: {
          restaurantId,
          tableNumber,
        },
      },
    });

    if (existingTable) {
      return NextResponse.json(
        {
          success: false,
          error: `Table "${tableNumber}" already exists for this restaurant. Please use a distinct number.`,
        },
        { status: 409 }
      );
    }

    const qrToken = generateTableQrToken();
    const qrCodeUrl = buildTableQrUrl(restaurant.slug, qrToken);
    const initialStatus = willBeActive ? (status || TableStatus.AVAILABLE) : TableStatus.INACTIVE;

    const newTable = await prisma.table.create({
      data: {
        restaurantId,
        tableNumber,
        name: name || null,
        status: initialStatus,
        qrToken,
        qrCodeUrl,
        isActive: willBeActive,
      },
    });

    const usage = await getTableUsageMetrics(restaurantId);

    return NextResponse.json(
      {
        success: true,
        message: "Table created successfully.",
        data: {
          table: newTable,
          usage,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    if (
      error instanceof Error &&
      (error.name === "TableLimitExceededError" || error.name === "SubscriptionRequiredError")
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: "statusCode" in error ? (error.statusCode as number) : 403 }
      );
    }
    console.error("POST /api/restaurants/[id]/tables error:", error);
    return NextResponse.json({ success: false, error: "Failed to create table." }, { status: 500 });
  }
}
