import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { UpdateServiceRequestStatusSchema } from "@/lib/validations/service-request";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; requestId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, requestId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const body = await request.json();
    const validation = UpdateServiceRequestStatusSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { status } = validation.data;

    // Verify service request exists and belongs to this restaurant
    const existing = await prisma.serviceRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        restaurantId: true,
        tableId: true,
        type: true,
        status: true,
      },
    });

    if (!existing || existing.restaurantId !== restaurantId) {
      return NextResponse.json(
        { success: false, error: "Service request not found." },
        { status: 404 }
      );
    }

    const updated = await prisma.serviceRequest.update({
      where: { id: requestId },
      data: { status },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: `Service request status updated to ${status}.`,
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/restaurants/[id]/service-requests/[requestId] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update service request status." },
      { status: 500 }
    );
  }
}
