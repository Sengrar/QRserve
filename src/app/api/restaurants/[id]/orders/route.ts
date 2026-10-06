import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess, AuthenticationError } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { MembershipRole, OrderStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    // Strict tenant authorization check: Owner, Manager, or Staff
    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Access denied to restaurant orders." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status");
    const sortParam = searchParams.get("sort");
    const limitParam = searchParams.get("limit");

    const isActiveFilter = statusParam === "ACTIVE";
    const validStatus = statusParam && Object.values(OrderStatus).includes(statusParam as OrderStatus)
      ? (statusParam as OrderStatus)
      : undefined;

    const takeLimit = limitParam ? Math.min(Math.max(parseInt(limitParam, 10) || 100, 1), 200) : 100;
    const sortDirection = sortParam === "asc" ? "asc" : "desc";

    const orders = await prisma.order.findMany({
      where: {
        restaurantId,
        ...(isActiveFilter
          ? {
              status: {
                in: [
                  OrderStatus.SUBMITTED,
                  OrderStatus.CONFIRMED,
                  OrderStatus.PREPARING,
                  OrderStatus.SERVED,
                ],
              },
            }
          : validStatus
          ? { status: validStatus }
          : {}),
      },
      include: {
        table: {
          select: {
            tableNumber: true,
            name: true,
          },
        },
        items: {
          select: {
            id: true,
            itemName: true,
            quantity: true,
            unitPrice: true,
            subtotal: true,
            taxRate: true,
            taxAmount: true,
            taxableAmount: true,
            notes: true,
          },
        },
      },
      orderBy: { createdAt: sortDirection },
      take: takeLimit,
    });

    return NextResponse.json({
      success: true,
      data: orders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerNotes: o.customerNotes,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount || 0),
        couponCode: o.couponCode || null,
        customerPhone: o.customerPhone || null,
        taxRate: Number(o.taxRate),
        taxAmount: Number(o.taxAmount),
        taxMode: o.taxMode,
        taxableAmount: Number(o.taxableAmount),
        cgstAmount: Number(o.cgstAmount),
        sgstAmount: Number(o.sgstAmount),
        totalAmount: Number(o.totalAmount),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        table: o.table
          ? {
              tableNumber: o.table.tableNumber,
              name: o.table.name,
            }
          : null,
        items: o.items.map((i) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
          taxRate: Number(i.taxRate),
          taxAmount: Number(i.taxAmount),
          taxableAmount: Number(i.taxableAmount),
          notes: i.notes,
        })),
      })),
    });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("GET /api/restaurants/[id]/orders error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error fetching orders." },
      { status: 500 }
    );
  }
}
