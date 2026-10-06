import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { UpdateCouponSchema } from "@/lib/validations/coupon";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; couponId: string }>;
}

/**
 * GET /api/restaurants/[id]/coupons/[couponId]
 * Returns details and recent usages of a specific coupon.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, couponId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied." },
        { status: 403 }
      );
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        id: couponId,
        restaurantId,
      },
      include: {
        usages: {
          take: 20,
          orderBy: { createdAt: "desc" },
          include: {
            order: {
              select: {
                orderNumber: true,
                totalAmount: true,
                status: true,
                createdAt: true,
              },
            },
          },
        },
        _count: {
          select: {
            orders: true,
            usages: true,
          },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "Coupon not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...coupon,
        discountValue: Number(coupon.discountValue),
        minOrderSubtotal: Number(coupon.minOrderSubtotal),
        maxDiscount: coupon.maxDiscount ? Number(coupon.maxDiscount) : null,
        usages: coupon.usages.map((u) => ({
          id: u.id,
          orderId: u.orderId,
          orderNumber: u.order?.orderNumber || null,
          customerIdentifier: u.customerIdentifier,
          discountAmount: Number(u.discountAmount),
          createdAt: u.createdAt.toISOString(),
        })),
      },
    });
  } catch (err: unknown) {
    if ((err as Error).name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 401 });
    }
    console.error("Error fetching coupon:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coupon details." },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/restaurants/[id]/coupons/[couponId]
 * Updates coupon configuration or toggles active status.
 * RBAC: OWNER, MANAGER.
 */
export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, couponId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. Only Owners and Managers can edit coupons." },
        { status: 403 }
      );
    }

    // Verify coupon exists and belongs to this restaurant
    const existing = await prisma.coupon.findFirst({
      where: {
        id: couponId,
        restaurantId,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Coupon not found or does not belong to this restaurant." },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = UpdateCouponSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: issue ? issue.message : "Invalid coupon update payload." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    const updatePayload: {
      description?: string | null;
      discountType?: typeof existing.discountType;
      discountValue?: number;
      minOrderSubtotal?: number;
      maxDiscount?: number | null;
      startDate?: Date;
      endDate?: Date | null;
      usageLimit?: number | null;
      perCustomerLimit?: number | null;
      isActive?: boolean;
    } = {};

    if (data.description !== undefined) updatePayload.description = data.description || null;
    if (data.discountType !== undefined) updatePayload.discountType = data.discountType;
    if (data.discountValue !== undefined) updatePayload.discountValue = data.discountValue;
    if (data.minOrderSubtotal !== undefined) updatePayload.minOrderSubtotal = data.minOrderSubtotal;
    if (data.maxDiscount !== undefined) updatePayload.maxDiscount = data.maxDiscount;
    if (data.startDate !== undefined) updatePayload.startDate = data.startDate ? new Date(data.startDate) : undefined;
    if (data.endDate !== undefined) updatePayload.endDate = data.endDate ? new Date(data.endDate) : null;
    if (data.usageLimit !== undefined) updatePayload.usageLimit = data.usageLimit;
    if (data.perCustomerLimit !== undefined) updatePayload.perCustomerLimit = data.perCustomerLimit;
    if (data.isActive !== undefined) updatePayload.isActive = data.isActive;

    const updated = await prisma.coupon.update({
      where: { id: couponId },
      data: updatePayload,
      include: {
        _count: {
          select: {
            orders: true,
            usages: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Coupon "${updated.code}" updated successfully.`,
      data: {
        id: updated.id,
        restaurantId: updated.restaurantId,
        code: updated.code,
        description: updated.description,
        discountType: updated.discountType,
        discountValue: Number(updated.discountValue),
        minOrderSubtotal: Number(updated.minOrderSubtotal),
        maxDiscount: updated.maxDiscount ? Number(updated.maxDiscount) : null,
        startDate: updated.startDate.toISOString(),
        endDate: updated.endDate ? updated.endDate.toISOString() : null,
        usageLimit: updated.usageLimit,
        usageCount: updated.usageCount ?? 0,
        perCustomerLimit: updated.perCustomerLimit,
        isActive: updated.isActive,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
        orderCount: updated._count?.orders ?? 0,
      },
    });
  } catch (err: unknown) {
    if ((err as Error).name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 401 });
    }
    console.error("Error updating coupon:", err);
    return NextResponse.json(
      { success: false, error: "Failed to update coupon." },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/restaurants/[id]/coupons/[couponId]
 * Deletes a coupon if unused, or deactivates it if historical orders exist.
 * RBAC: OWNER.
 */
export async function DELETE(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, couponId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. Only Restaurant Owners can delete coupons." },
        { status: 403 }
      );
    }

    const coupon = await prisma.coupon.findFirst({
      where: {
        id: couponId,
        restaurantId,
      },
      include: {
        _count: {
          select: {
            orders: true,
            usages: true,
          },
        },
      },
    });

    if (!coupon) {
      return NextResponse.json(
        { success: false, error: "Coupon not found." },
        { status: 404 }
      );
    }

    // If historical orders reference this coupon, soft-deactivate instead of hard-delete to preserve history
    if (coupon._count.orders > 0 || coupon._count.usages > 0) {
      await prisma.coupon.update({
        where: { id: couponId },
        data: { isActive: false },
      });

      return NextResponse.json({
        success: true,
        message: `Coupon "${coupon.code}" has historical order usages and was deactivated to preserve audit history.`,
      });
    }

    // Safe to hard delete unused coupon
    await prisma.coupon.delete({
      where: { id: couponId },
    });

    return NextResponse.json({
      success: true,
      message: `Coupon "${coupon.code}" deleted successfully.`,
    });
  } catch (err: unknown) {
    if ((err as Error).name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 401 });
    }
    console.error("Error deleting coupon:", err);
    return NextResponse.json(
      { success: false, error: "Failed to delete coupon." },
      { status: 500 }
    );
  }
}
