import { NextResponse } from "next/server";
import { TableStatus } from "@prisma/client";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { UpdateTableSchema } from "@/lib/validations/table";
import { assertCanAddTable, getTableUsageMetrics } from "@/lib/subscription/limits";
import {
  generateTableQrToken,
  buildTableQrUrl,
  generateQrDataUrl,
  generateQrSvg,
} from "@/lib/qr";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; tablePath: string[] }>;
}

/**
 * Unified handler for Table operations:
 * - GET    /api/restaurants/[id]/tables/[tableId]             -> Returns table data (or QR if ?view=qr)
 * - GET    /api/restaurants/[id]/tables/[tableId]/qr          -> Returns QR preview data or binary download
 * - PATCH  /api/restaurants/[id]/tables/[tableId]             -> Updates table status/info or regenerates QR
 * - POST   /api/restaurants/[id]/tables/[tableId]/regenerate  -> Regenerates table QR token
 * - DELETE /api/restaurants/[id]/tables/[tableId]             -> Deletes table
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, tablePath } = await context.params;

    if (!tablePath || tablePath.length === 0) {
      return NextResponse.json({ success: false, error: "Table ID required." }, { status: 400 });
    }

    const tableId = tablePath[0];
    const subAction = tablePath[1]; // e.g., "qr"

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const [restaurant, rawTable] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { id: true, name: true, slug: true },
      }),
      prisma.table.findUnique({
        where: { id: tableId },
      }),
    ]);

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    if (!rawTable || rawTable.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Table not found." }, { status: 404 });
    }

    // Ensure table has a valid qrToken
    let table = rawTable;
    if (!table.qrToken) {
      const qrToken = generateTableQrToken();
      const qrCodeUrl = buildTableQrUrl(restaurant.slug, qrToken);
      table = await prisma.table.update({
        where: { id: table.id },
        data: { qrToken, qrCodeUrl },
      });
    }

    const url = new URL(request.url);
    const downloadFormat = url.searchParams.get("download");
    const isQrRequest = subAction === "qr" || url.searchParams.get("view") === "qr" || !!downloadFormat;

    // Handle QR requests
    if (isQrRequest) {
      const host = request.headers.get("host") || "localhost:3000";
      const protocol = request.headers.get("x-forwarded-proto") || "http";
      const origin = process.env.NEXT_PUBLIC_APP_URL || `${protocol}://${host}`;
      const fullCustomerUrl = `${origin}${table.qrCodeUrl}`;

      // SVG direct vector download
      if (downloadFormat === "svg") {
        const svg = await generateQrSvg(fullCustomerUrl);
        const filename = `${restaurant.slug}-table-${table.tableNumber.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-qr.svg`;
        return new NextResponse(svg, {
          status: 200,
          headers: {
            "Content-Type": "image/svg+xml",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      // PNG direct raster download
      if (downloadFormat === "png") {
        const dataUrl = await generateQrDataUrl(fullCustomerUrl, { width: 600 });
        const base64Data = dataUrl.replace(/^data:image\/png;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");
        const filename = `${restaurant.slug}-table-${table.tableNumber.toLowerCase().replace(/[^a-z0-9_-]/g, "-")}-qr.png`;
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            "Content-Type": "image/png",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }

      // JSON response with both formats for preview and tent card printing
      const [dataUrl, svg] = await Promise.all([
        generateQrDataUrl(fullCustomerUrl, { width: 360 }),
        generateQrSvg(fullCustomerUrl),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          tableId: table.id,
          tableNumber: table.tableNumber,
          name: table.name,
          status: table.status,
          isActive: table.isActive,
          qrToken: table.qrToken,
          qrCodeUrl: table.qrCodeUrl,
          fullCustomerUrl,
          dataUrl,
          svg,
          restaurantName: restaurant.name,
          restaurantSlug: restaurant.slug,
        },
      });
    }

    // Default: Return single table data
    return NextResponse.json({
      success: true,
      data: table,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/tables/[...tablePath] error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch table." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, tablePath } = await context.params;

    if (!tablePath || tablePath.length === 0) {
      return NextResponse.json({ success: false, error: "Table ID required." }, { status: 400 });
    }

    const tableId = tablePath[0];

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const [restaurant, table] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true },
      }),
      prisma.table.findUnique({
        where: { id: tableId },
      }),
    ]);

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    if (!table || table.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Table not found." }, { status: 404 });
    }

    // Generate fresh unpredictable token
    const newQrToken = generateTableQrToken();
    const newQrCodeUrl = buildTableQrUrl(restaurant.slug, newQrToken);

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: {
        qrToken: newQrToken,
        qrCodeUrl: newQrCodeUrl,
      },
    });

    return NextResponse.json({
      success: true,
      message: "QR code token regenerated successfully. Old physical QR codes are now invalidated.",
      data: {
        table: updated,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("POST /api/restaurants/[id]/tables/[...tablePath] error:", error);
    return NextResponse.json({ success: false, error: "Failed to regenerate QR." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, tablePath } = await context.params;

    if (!tablePath || tablePath.length === 0) {
      return NextResponse.json({ success: false, error: "Table ID required." }, { status: 400 });
    }

    const tableId = tablePath[0];

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const [restaurant, table] = await Promise.all([
      prisma.restaurant.findUnique({
        where: { id: restaurantId },
        select: { slug: true },
      }),
      prisma.table.findUnique({
        where: { id: tableId },
      }),
    ]);

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    if (!table || table.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Table not found." }, { status: 404 });
    }

    const json = await request.json();

    // Check if QR regeneration was requested via PATCH
    if (json.regenerateQr === true) {
      const newQrToken = generateTableQrToken();
      const newQrCodeUrl = buildTableQrUrl(restaurant.slug, newQrToken);

      const updated = await prisma.table.update({
        where: { id: tableId },
        data: {
          qrToken: newQrToken,
          qrCodeUrl: newQrCodeUrl,
        },
      });

      return NextResponse.json({
        success: true,
        message: "QR code token regenerated successfully. Old QR codes are now invalidated.",
        data: {
          table: updated,
        },
      });
    }

    const validation = UpdateTableSchema.safeParse(json);

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

    let targetIsActive = table.isActive;
    let targetStatus = table.status;

    if (isActive !== undefined) {
      targetIsActive = isActive;
    }

    if (status !== undefined) {
      targetStatus = status;
      if (status === TableStatus.INACTIVE) {
        targetIsActive = false;
      } else if (!targetIsActive) {
        targetIsActive = true;
      }
    }

    if (!targetIsActive) {
      targetStatus = TableStatus.INACTIVE;
    } else if (targetStatus === TableStatus.INACTIVE) {
      targetStatus = TableStatus.AVAILABLE;
    }

    // Verify limit when activating an inactive table
    if (targetIsActive && !table.isActive) {
      await assertCanAddTable(restaurantId);
    }

    // Check uniqueness if table number changes
    if (tableNumber && tableNumber !== table.tableNumber) {
      const conflict = await prisma.table.findUnique({
        where: {
          restaurantId_tableNumber: {
            restaurantId,
            tableNumber,
          },
        },
      });

      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: `Table "${tableNumber}" already exists for this restaurant.`,
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.table.update({
      where: { id: tableId },
      data: {
        ...(tableNumber !== undefined && { tableNumber }),
        ...(name !== undefined && { name: name || null }),
        status: targetStatus,
        isActive: targetIsActive,
      },
    });

    const usage = await getTableUsageMetrics(restaurantId);

    return NextResponse.json({
      success: true,
      message: "Table updated successfully.",
      data: {
        table: updated,
        usage,
      },
    });
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
    console.error("PATCH /api/restaurants/[id]/tables/[...tablePath] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update table." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, tablePath } = await context.params;

    if (!tablePath || tablePath.length === 0) {
      return NextResponse.json({ success: false, error: "Table ID required." }, { status: 400 });
    }

    const tableId = tablePath[0];

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const table = await prisma.table.findUnique({
      where: { id: tableId },
    });

    if (!table || table.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Table not found." }, { status: 404 });
    }

    await prisma.table.delete({
      where: { id: tableId },
    });

    const usage = await getTableUsageMetrics(restaurantId);

    return NextResponse.json({
      success: true,
      message: "Table removed successfully.",
      data: { usage },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("DELETE /api/restaurants/[id]/tables/[...tablePath] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete table." }, { status: 500 });
  }
}
