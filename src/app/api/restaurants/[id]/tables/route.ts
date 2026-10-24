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

    const [restaurant, rawTables] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true },
      }),
      prisma.table.findMany({
        where: { restaurantId },
        orderBy: [{ tableNumber: "asc" }],
      }),
    ]);

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const totalTables = rawTables.length;
    const activeTables = rawTables.filter((t) => t.isActive).length;

    const usage = await getTableUsageMetrics(restaurantId, prisma, {
      totalTables,
      activeTables,
    });

    // Check if any table actually lacks a qrToken before invoking updates
    const hasMissingTokens = rawTables.some((t) => !t.qrToken);
    let tables = rawTables;

    if (hasMissingTokens) {
      tables = await Promise.all(
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
    }

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

    const { newTable, usage } = await prisma.$transaction(async (tx) => {
      // Row-level lock on Restaurant row to serialize concurrent table additions for this restaurant
      await tx.$executeRaw`SELECT id FROM "Restaurant" WHERE id = ${restaurantId} FOR UPDATE`;

      if (willBeActive) {
        await assertCanAddTable(restaurantId, tx);
      }

      // Check uniqueness of table number for this restaurant
      const existingTable = await tx.table.findUnique({
        where: {
          restaurantId_tableNumber: {
            restaurantId,
            tableNumber,
          },
        },
      });

      if (existingTable) {
        const dupError = new Error(`Table "${tableNumber}" already exists for this restaurant. Please use a distinct number.`);
        dupError.name = "DuplicateTableError";
        throw dupError;
      }

      const qrToken = generateTableQrToken();
      const qrCodeUrl = buildTableQrUrl(restaurant.slug, qrToken);
      const initialStatus = willBeActive ? (status || TableStatus.AVAILABLE) : TableStatus.INACTIVE;

      const created = await tx.table.create({
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

      const metrics = await getTableUsageMetrics(restaurantId, tx);
      return { newTable: created, usage: metrics };
    });

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
    if (error instanceof Error && error.name === "DuplicateTableError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
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
