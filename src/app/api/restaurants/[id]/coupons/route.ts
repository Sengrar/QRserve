import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { CreateCouponSchema } from "@/lib/validations/coupon";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/restaurants/[id]/coupons
 * Returns all coupons for this restaurant with statistics.
 * RBAC: OWNER, MANAGER, STAFF.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
      MembershipRole.STAFF,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not have permission to view coupons." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim().toUpperCase();
    const activeFilter = searchParams.get("active"); // "true" | "false" | null

    const whereClause: {
      restaurantId: string;
      isActive?: boolean;
      code?: { contains: string; mode: "insensitive" };
    } = {
      restaurantId,
    };

    if (activeFilter === "true") whereClause.isActive = true;
    if (activeFilter === "false") whereClause.isActive = false;
    if (search) whereClause.code = { contains: search, mode: "insensitive" };

    const coupons = await prisma.coupon.findMany({
      where: whereClause,
      include: {
        _count: {
          select: {
            orders: true,
            usages: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Compute aggregate coupon stats for the restaurant
    const totalCoupons = coupons.length;
    const activeCoupons = coupons.filter((c) => c.isActive).length;
    const totalRedemptions = coupons.reduce((sum, c) => sum + c.usageCount, 0);

    // Sum total discount given across all orders for this restaurant with coupons
    const totalDiscountAgg = await prisma.order.aggregate({
      where: {
        restaurantId,
        couponId: { not: null },
        status: { not: "CANCELLED" },
      },
      _sum: {
        discountAmount: true,
      },
    });

    const totalDiscountGiven = Number(totalDiscountAgg._sum.discountAmount || 0);

    return NextResponse.json({
      success: true,
      data: {
        coupons: coupons.map((c) => ({
          id: c.id,
          restaurantId: c.restaurantId,
          code: c.code,
          description: c.description,
          discountType: c.discountType,
          discountValue: Number(c.discountValue),
          minOrderSubtotal: Number(c.minOrderSubtotal),
          maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
          startDate: c.startDate.toISOString(),
          endDate: c.endDate ? c.endDate.toISOString() : null,
          usageLimit: c.usageLimit,
          usageCount: c.usageCount,
          perCustomerLimit: c.perCustomerLimit,
          isActive: c.isActive,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          orderCount: c._count.orders,
        })),
        stats: {
          totalCoupons,
          activeCoupons,
          totalRedemptions,
          totalDiscountGiven,
        },
      },
    });
  } catch (err: unknown) {
    if ((err as Error).name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 401 });
    }
    console.error("Error fetching coupons:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coupons." },
      { status: 500 }
    );
  }
}

/**
 * POST /api/restaurants/[id]/coupons
 * Creates a new coupon for this restaurant.
 * RBAC: OWNER, MANAGER.
 */
export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
    ]);

    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. Only Owners and Managers can create coupons." },
        { status: 403 }
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = CreateCouponSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        { success: false, error: issue ? issue.message : "Invalid coupon data." },
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Check code uniqueness per restaurant
    const existingCoupon = await prisma.coupon.findUnique({
      where: {
        restaurantId_code: {
          restaurantId,
          code: data.code,
        },
      },
    });

    if (existingCoupon) {
      return NextResponse.json(
        {
          success: false,
          error: `Coupon code "${data.code}" already exists for this restaurant. Please use a unique code.`,
        },
        { status: 409 }
      );
    }

    const newCoupon = await prisma.coupon.create({
      data: {
        restaurantId,
        code: data.code,
        description: data.description || null,
        discountType: data.discountType,
        discountValue: data.discountValue,
        minOrderSubtotal: data.minOrderSubtotal,
        maxDiscount: data.maxDiscount || null,
        startDate: data.startDate ? new Date(data.startDate) : new Date(),
        endDate: data.endDate ? new Date(data.endDate) : null,
        usageLimit: data.usageLimit || null,
        perCustomerLimit: data.perCustomerLimit || null,
        isActive: data.isActive,
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Coupon "${newCoupon.code}" created successfully.`,
        data: {
          id: newCoupon.id,
          restaurantId: newCoupon.restaurantId,
          code: newCoupon.code,
          description: newCoupon.description,
          discountType: newCoupon.discountType,
          discountValue: Number(newCoupon.discountValue),
          minOrderSubtotal: Number(newCoupon.minOrderSubtotal),
          maxDiscount: newCoupon.maxDiscount ? Number(newCoupon.maxDiscount) : null,
          startDate: newCoupon.startDate.toISOString(),
          endDate: newCoupon.endDate ? newCoupon.endDate.toISOString() : null,
          usageLimit: newCoupon.usageLimit,
          usageCount: newCoupon.usageCount ?? 0,
          perCustomerLimit: newCoupon.perCustomerLimit,
          isActive: newCoupon.isActive,
          createdAt: newCoupon.createdAt.toISOString(),
          updatedAt: newCoupon.updatedAt.toISOString(),
          orderCount: 0,
        },
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    if ((err as Error).name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: (err as Error).message }, { status: 401 });
    }
    console.error("Error creating coupon:", err);
    return NextResponse.json(
      { success: false, error: "Failed to create coupon." },
      { status: 500 }
    );
  }
}
