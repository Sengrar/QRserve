import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant } from "@/lib/security/tenant";
import { calculateCombinedSessionBill } from "@/lib/orders/session-billing";
import { DiningSessionStatus, OrderPaymentStatus, OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

/**
 * Customer / Public Endpoint to retrieve the Table-Wise Running Combined Bill
 * or Consolidated Receipt for a dining session.
 *
 * Query Params:
 * - qr: Table QR Token (from scanning table QR)
 * - table: Table Number (e.g. "3" or "T-1")
 * - orderNumber: Any order number placed in this session
 * - sessionId: Direct session ID or sessionCode
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const { searchParams } = new URL(request.url);

    const qrToken = searchParams.get("qr");
    const tableNumberParam = searchParams.get("table");
    const orderNumber = searchParams.get("orderNumber");
    const sessionId = searchParams.get("sessionId");

    // 1. Fetch Restaurant details
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        phone: true,
        address: true,
        approvalStatus: true,
        isActive: true,
        isSuspended: true,
        gstEnabled: true,
        gstin: true,
        legalName: true,
        taxRate: true,
        taxMode: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Restaurant not found." },
        { status: 404 }
      );
    }

    if (!canPubliclyAccessRestaurant(restaurant)) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "This restaurant is currently not accepting orders or bills." },
        { status: 403 }
      );
    }

    // 2. Resolve Table ID if possible
    let resolvedTableId: string | null = null;
    let preloadedOrder: { id: string; tableId: string | null; diningSessionId: string | null } | null = null;

    if (qrToken) {
      const table = await prisma.table.findFirst({
        where: {
          restaurantId: restaurant.id,
          qrToken,
        },
        select: { id: true, tableNumber: true, name: true },
      });
      if (table) resolvedTableId = table.id;
    } else if (tableNumberParam) {
      const table = await prisma.table.findUnique({
        where: {
          restaurantId_tableNumber: {
            restaurantId: restaurant.id,
            tableNumber: tableNumberParam.trim(),
          },
        },
        select: { id: true, tableNumber: true, name: true },
      });
      if (table) resolvedTableId = table.id;
    }

    if (orderNumber) {
      preloadedOrder = await prisma.order.findUnique({
        where: { orderNumber },
        select: { id: true, tableId: true, diningSessionId: true },
      });
      if (preloadedOrder?.tableId && !resolvedTableId) {
        resolvedTableId = preloadedOrder.tableId;
      }
    }

    // 3. Find the Dining Session
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let session: any = null;

    if (sessionId) {
      session = await prisma.diningSession.findFirst({
        where: {
          restaurantId: restaurant.id,
          OR: [{ id: sessionId }, { sessionCode: sessionId }],
        },
        include: {
          table: { select: { id: true, tableNumber: true, name: true } },
          orders: {
            include: { items: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    // If order is linked to a dining session, retrieve it directly
    if (!session && preloadedOrder?.diningSessionId) {
      session = await prisma.diningSession.findFirst({
        where: {
          id: preloadedOrder.diningSessionId,
          restaurantId: restaurant.id,
        },
        include: {
          table: { select: { id: true, tableNumber: true, name: true } },
          orders: {
            include: { items: true },
            orderBy: { createdAt: "asc" },
          },
        },
      });
    }

    if (!session && resolvedTableId) {
      // First try to find an active pending session for this table
      session = await prisma.diningSession.findFirst({
        where: {
          restaurantId: restaurant.id,
          tableId: resolvedTableId,
          status: { in: [DiningSessionStatus.ACTIVE, DiningSessionStatus.PAYMENT_REQUESTED] },
          paymentStatus: OrderPaymentStatus.PENDING,
        },
        include: {
          table: { select: { id: true, tableNumber: true, name: true } },
          orders: {
            include: { items: true },
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      // If no active session, find the most recent completed/paid session for receipt viewing
      if (!session) {
        session = await prisma.diningSession.findFirst({
          where: {
            restaurantId: restaurant.id,
            tableId: resolvedTableId,
          },
          include: {
            table: { select: { id: true, tableNumber: true, name: true } },
            orders: {
              include: { items: true },
              orderBy: { createdAt: "asc" },
            },
          },
          orderBy: { updatedAt: "desc" },
        });
      }
    }

    // Fallback for standalone takeaway / counter orders without table session
    if (!session && orderNumber) {
      const standaloneOrder = await prisma.order.findUnique({
        where: { orderNumber },
        include: {
          table: { select: { id: true, tableNumber: true, name: true } },
          items: true,
        },
      });

      if (standaloneOrder && standaloneOrder.restaurantId === restaurant.id) {
        session = {
          id: `single_${standaloneOrder.id}`,
          sessionCode: `ORD-${standaloneOrder.orderNumber}`,
          status: standaloneOrder.status === OrderStatus.COMPLETED ? DiningSessionStatus.COMPLETED : DiningSessionStatus.ACTIVE,
          paymentStatus: OrderPaymentStatus.PENDING,
          paymentMethod: null,
          paidAt: null,
          confirmedById: null,
          receiptNumber: null,
          createdAt: standaloneOrder.createdAt,
          table: standaloneOrder.table,
          orders: [standaloneOrder],
        };
      }
    }

    // If still no session exists for this table
    if (!session || session.orders.length === 0) {
      return NextResponse.json(
        {
          success: true,
          hasActiveBill: false,
          message: "No active orders or dining session found for this table.",
          data: null,
        },
        {
          headers: {
            "Cache-Control": "private, no-cache, no-store, must-revalidate",
          },
        }
      );
    }

    // 4. Calculate the combined session bill
    const bill = calculateCombinedSessionBill({
      session,
      restaurant,
      orders: session.orders,
    });

    return NextResponse.json(
      {
        success: true,
        hasActiveBill: true,
        data: bill,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/r/[slug]/bill error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve combined table bill." },
      { status: 500 }
    );
  }
}

/**
 * Customer Action: "Pay & Get Final Bill"
 * POST /api/r/[slug]/bill
 * Locks the table's active dining session in PAYMENT_REQUESTED status,
 * computes authoritative final running totals, and alerts staff.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;
    const body = await request.json().catch(() => ({}));

    const orderNumber = typeof body?.orderNumber === "string" ? body.orderNumber.trim() : null;
    const qrToken = typeof body?.qr === "string" ? body.qr.trim() : null;
    const tableNumberParam = typeof body?.table === "string" ? body.table.trim() : null;
    const sessionId = typeof body?.sessionId === "string" ? body.sessionId.trim() : null;

    // 1. Fetch restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        approvalStatus: true,
        isActive: true,
        isSuspended: true,
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Restaurant not found." },
        { status: 404 }
      );
    }

    if (!canPubliclyAccessRestaurant(restaurant)) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "This restaurant is currently closed or inactive." },
        { status: 403 }
      );
    }

    // 2. Resolve Table context
    let resolvedTableId: string | null = null;
    if (qrToken) {
      const table = await prisma.table.findFirst({
        where: { restaurantId: restaurant.id, qrToken },
        select: { id: true },
      });
      if (table) resolvedTableId = table.id;
    } else if (tableNumberParam) {
      const table = await prisma.table.findUnique({
        where: {
          restaurantId_tableNumber: {
            restaurantId: restaurant.id,
            tableNumber: tableNumberParam,
          },
        },
        select: { id: true },
      });
      if (table) resolvedTableId = table.id;
    }

    // 3. Request final table bill authoritatively
    const { requestFinalTableBill } = await import("@/lib/orders/session-billing");
    const result = await requestFinalTableBill({
      restaurantId: restaurant.id,
      tableId: resolvedTableId,
      sessionId,
      orderNumber,
    });

    return NextResponse.json(
      {
        success: true,
        message: result.isAlreadyRequested
          ? "Final bill has already been requested. Please proceed to the counter to pay."
          : result.isAlreadyPaid
          ? "This session is already settled and paid."
          : "Final bill requested successfully. Please pay at the counter.",
        data: result.bill,
        isAlreadyRequested: result.isAlreadyRequested,
        isAlreadyPaid: result.isAlreadyPaid,
        receiptNumber: result.receiptNumber || result.bill.receiptNumber,
      },
      {
        headers: {
          "Cache-Control": "private, no-cache, no-store, must-revalidate",
        },
      }
    );
  } catch (error: any) {
    console.error("POST /api/r/[slug]/bill error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Failed to request final bill.",
      },
      { status: 400 }
    );
  }
}
