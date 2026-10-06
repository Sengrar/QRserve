import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { RestaurantCouponManager } from "@/components/coupons/RestaurantCouponManager";

export const dynamic = "force-dynamic";

interface CouponsPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantCouponsPage({ params }: CouponsPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
  if (!access.authorized) {
    redirect("/dashboard");
  }

  const [restaurant, coupons, discountAgg] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, slug: true },
    }),
    prisma.coupon.findMany({
      where: { restaurantId },
      include: {
        _count: {
          select: { usages: true, orders: true },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.order.aggregate({
      where: {
        restaurantId,
        status: { not: "CANCELLED" },
        discountAmount: { gt: 0 },
      },
      _sum: {
        discountAmount: true,
      },
      _count: {
        id: true,
      },
    }),
  ]);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantCouponManager
      restaurant={restaurant}
      initialCoupons={coupons.map((c) => ({
        id: c.id,
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        minOrderSubtotal: Number(c.minOrderSubtotal),
        maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
        startDate: c.startDate ? c.startDate.toISOString() : null,
        endDate: c.endDate ? c.endDate.toISOString() : null,
        usageLimit: c.usageLimit,
        usageCount: c.usageCount,
        perCustomerLimit: c.perCustomerLimit,
        isActive: c.isActive,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
        orderCount: c._count.orders,
      }))}
      stats={{
        totalDiscountGiven: Number(discountAgg._sum.discountAmount || 0),
        couponOrdersCount: discountAgg._count.id || 0,
      }}
    />
  );
}
