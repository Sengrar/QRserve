import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { RestaurantServiceRequestManager } from "@/components/service-requests/RestaurantServiceRequestManager";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface ServiceRequestsPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantServiceRequestsPage({
  params,
}: ServiceRequestsPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  // Strict tenant authorization: Owner, Manager, or Staff
  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
    MembershipRole.OWNER,
    MembershipRole.MANAGER,
    MembershipRole.STAFF,
  ]);

  if (!access.authorized) {
    redirect("/dashboard");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!restaurant) {
    notFound();
  }

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [initialRequests, totalPending, totalInProgress, completedToday] = await Promise.all([
    prisma.serviceRequest.findMany({
      where: { restaurantId },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.serviceRequest.count({
      where: {
        restaurantId,
        status: "PENDING",
      },
    }),
    prisma.serviceRequest.count({
      where: {
        restaurantId,
        status: "IN_PROGRESS",
      },
    }),
    prisma.serviceRequest.count({
      where: {
        restaurantId,
        status: "COMPLETED",
        updatedAt: { gte: startOfToday },
      },
    }),
  ]);

  return (
    <RestaurantServiceRequestManager
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
      }}
      initialRequests={initialRequests.map((r) => ({
        id: r.id,
        restaurantId: r.restaurantId,
        tableId: r.tableId,
        type: r.type,
        status: r.status,
        message: r.message,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        table: {
          id: r.table.id,
          tableNumber: r.table.tableNumber,
          name: r.table.name,
        },
      }))}
      initialStats={{
        pending: totalPending,
        inProgress: totalInProgress,
        completedToday,
      }}
    />
  );
}
