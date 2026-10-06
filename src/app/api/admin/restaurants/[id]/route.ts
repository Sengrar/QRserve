import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { UpdateRestaurantStatusByAdminSchema } from "@/lib/validations/restaurant";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    await requireSuperAdmin();
    const { id } = await context.params;

    const json = await request.json();
    const result = UpdateRestaurantStatusByAdminSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const { approvalStatus, rejectionReason, isSuspended } = result.data;

    const dataToUpdate: {
      approvalStatus?: ApprovalStatus;
      rejectionReason?: string | null;
      approvedAt?: Date | null;
      isSuspended?: boolean;
    } = {};

    if (approvalStatus !== undefined) {
      dataToUpdate.approvalStatus = approvalStatus;
      if (approvalStatus === ApprovalStatus.APPROVED) {
        dataToUpdate.approvedAt = new Date();
        dataToUpdate.rejectionReason = null;
      } else if (approvalStatus === ApprovalStatus.REJECTED) {
        dataToUpdate.rejectionReason = rejectionReason || "Application did not meet requirements.";
      }
    }

    if (isSuspended !== undefined) {
      dataToUpdate.isSuspended = isSuspended;
    }

    const updated = await prisma.restaurant.update({
      where: { id },
      data: dataToUpdate,
    });

    return NextResponse.json({
      success: true,
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && (error.name === "AuthenticationError" || error.name === "AuthorizationError")) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("PATCH /api/admin/restaurants/[id] error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
