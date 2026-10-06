import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { getTableUsageMetrics } from "@/lib/subscription/limits";
import { RestaurantTableManager } from "@/components/tables/RestaurantTableManager";

export const dynamic = "force-dynamic";

interface TablesPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantTablesPage({ params }: TablesPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
  if (!access.authorized) {
    redirect("/dashboard");
  }

  const [restaurant, tables, usage] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
    }),
    prisma.table.findMany({
      where: { restaurantId },
      orderBy: { tableNumber: "asc" },
    }),
    getTableUsageMetrics(restaurantId),
  ]);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantTableManager
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
      }}
      initialTables={tables.map((t) => ({
        id: t.id,
        tableNumber: t.tableNumber,
        name: t.name,
        status: t.status,
        qrToken: t.qrToken,
        qrCodeUrl: t.qrCodeUrl,
        isActive: t.isActive,
        createdAt: t.createdAt.toISOString(),
      }))}
      initialUsage={{
        subscription: {
          hasSubscription: usage.subscription.hasSubscription,
          isValid: usage.subscription.isValid,
          isExpired: usage.subscription.isExpired,
          isSuspended: usage.subscription.isSuspended,
          isNearExpiry: usage.subscription.isNearExpiry,
          daysRemaining: usage.subscription.daysRemaining,
          tableLimit: usage.subscription.tableLimit,
          plan: usage.subscription.plan,
          status: usage.subscription.status,
        },
        totalTables: usage.totalTables,
        activeTables: usage.activeTables,
        remainingAllowance: usage.remainingAllowance,
        isAtLimit: usage.isAtLimit,
      }}
    />
  );
}
