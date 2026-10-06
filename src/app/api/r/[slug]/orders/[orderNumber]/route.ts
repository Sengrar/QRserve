import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { verifyOrderAccessToken } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth/session";
import { verifyRestaurantAccess } from "@/lib/security/tenant";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string; orderNumber: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug, orderNumber } = await context.params;
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        phone: true,
        address: true,
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

    const order = await prisma.order.findUnique({
      where: { orderNumber },
      include: {
        table: { select: { tableNumber: true, name: true } },
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
    });

    if (!order || order.restaurantId !== restaurant.id) {
      return NextResponse.json(
        { success: false, code: "ORDER_NOT_FOUND", error: "Order not found." },
        { status: 404 }
      );
    }

    // Access control:
    // 1. Valid customer order tracking token
    // 2. OR authenticated restaurant staff/owner with access to this restaurant
    const isTokenValid = token ? verifyOrderAccessToken(orderNumber, restaurant.id, token) : false;

    if (!isTokenValid) {
      // Check if user is logged in as restaurant owner or manager
      const sessionUser = await getSessionUser();
      let hasStaffAccess = false;
      if (sessionUser) {
        const access = await verifyRestaurantAccess(sessionUser.id, sessionUser.role, restaurant.id);
        hasStaffAccess = access.authorized;
      }

      if (!hasStaffAccess) {
        return NextResponse.json(
          {
            success: false,
            code: "ACCESS_DENIED",
            error: "Order tracking access token is invalid or missing.",
          },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        customerNotes: order.customerNotes,
        subtotal: Number(order.subtotal),
        discountAmount: Number(order.discountAmount || 0),
        couponCode: order.couponCode || null,
        taxRate: Number(order.taxRate),
        taxAmount: Number(order.taxAmount),
        taxMode: order.taxMode,
        taxableAmount: Number(order.taxableAmount),
        cgstAmount: Number(order.cgstAmount),
        sgstAmount: Number(order.sgstAmount),
        totalAmount: Number(order.totalAmount),
        table: order.table
          ? {
              tableNumber: order.table.tableNumber,
              name: order.table.name,
            }
          : null,
        restaurant: {
          name: restaurant.name,
          slug: restaurant.slug,
          phone: restaurant.phone,
          address: restaurant.address,
          gstEnabled: restaurant.gstEnabled,
          gstin: restaurant.gstin,
          legalName: restaurant.legalName,
          taxRate: Number(restaurant.taxRate),
          taxMode: restaurant.taxMode,
        },
        items: order.items.map((i) => ({
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
      },
    });
  } catch (error) {
    console.error("GET /api/r/[slug]/orders/[orderNumber] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error while fetching order." },
      { status: 500 }
    );
  }
}
