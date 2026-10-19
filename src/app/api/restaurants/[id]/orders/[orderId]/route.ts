import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess, AuthenticationError } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { UpdateOrderStatusSchema } from "@/lib/validations/order";
import { validateOrderStatusTransition } from "@/lib/orders/transitions";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; orderId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, orderId } = await context.params;

    // Strict tenant authorization
    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: "Access denied to update restaurant orders." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateOrderStatusSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: parsed.error.issues[0]?.message || "Invalid status payload.",
        },
        { status: 400 }
      );
    }

    const existingOrder = await prisma.order.findFirst({
      where: {
        id: orderId,
        restaurantId,
      },
    });

    if (!existingOrder) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Order not found." },
        { status: 404 }
      );
    }

    // Validate business lifecycle transition rules
    const validation = validateOrderStatusTransition(existingOrder.status, parsed.data.status);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_TRANSITION",
          error: validation.error || `Invalid status transition from ${existingOrder.status} to ${parsed.data.status}.`,
        },
        { status: 400 }
      );
    }

    // Idempotent: same status update succeeds safely without re-writing
    if (validation.isNoop) {
      return NextResponse.json({
        success: true,
        data: {
          id: existingOrder.id,
          orderNumber: existingOrder.orderNumber,
          status: existingOrder.status,
          updatedAt: existingOrder.updatedAt.toISOString(),
          isNoop: true,
        },
      });
    }

    // Optimistic concurrency safety: ensure status hasn't changed since read
    const updateResult = await prisma.order.updateMany({
      where: {
        id: orderId,
        restaurantId,
        status: existingOrder.status,
      },
      data: {
        status: parsed.data.status,
      },
    });

    if (updateResult.count === 0) {
      const concurrentOrder = await prisma.order.findUnique({
        where: { id: orderId },
        select: { status: true },
      });
      return NextResponse.json(
        {
          success: false,
          code: "CONCURRENT_CONFLICT",
          error: `Order status was modified concurrently to ${concurrentOrder?.status || "another status"}.`,
        },
        { status: 409 }
      );
    }

    const updated = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        updatedAt: true,
      },
    });

    if (!updated) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Order not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        orderNumber: updated.orderNumber,
        status: updated.status,
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (error: unknown) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }
    console.error("PATCH /api/restaurants/[id]/orders/[orderId] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error updating order status." },
      { status: 500 }
    );
  }
}
