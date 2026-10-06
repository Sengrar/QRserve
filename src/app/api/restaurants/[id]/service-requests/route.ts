import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { ServiceRequestStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const statusParam = searchParams.get("status")?.toUpperCase();

    // Build status filter
    const statusFilter =
      statusParam && statusParam !== "ALL" && Object.values(ServiceRequestStatus).includes(statusParam as ServiceRequestStatus)
        ? (statusParam as ServiceRequestStatus)
        : undefined;

    // Start of today (midnight) for stats
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [requests, totalPending, totalInProgress, completedToday] = await Promise.all([
      prisma.serviceRequest.findMany({
        where: {
          restaurantId,
          ...(statusFilter && { status: statusFilter }),
        },
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

    return NextResponse.json({
      success: true,
      data: {
        requests,
        stats: {
          pending: totalPending,
          inProgress: totalInProgress,
          completedToday,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/service-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch service requests." },
      { status: 500 }
    );
  }
}
