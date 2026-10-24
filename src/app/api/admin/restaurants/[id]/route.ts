import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { UpdateRestaurantStatusByAdminSchema } from "@/lib/validations/restaurant";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus, SubscriptionPlan, SubscriptionStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const adminUser = await requireSuperAdmin();
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
      include: {
        subscription: true,
        _count: {
          select: { tables: true },
        },
        tables: {
          select: { id: true, isActive: true },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const { approvalStatus, rejectionReason, isSuspended, tableLimit } = result.data;

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

    let updatedSubscription = restaurant.subscription;

    if (tableLimit !== undefined) {
      const auditNote = `[${new Date().toISOString()} by ${adminUser.name}]: Super Admin updated Allowed Tables limit to ${tableLimit}`;
      const combinedNotes = restaurant.subscription?.notes
        ? `${restaurant.subscription.notes}\n${auditNote}`
        : auditNote;

      updatedSubscription = await prisma.subscription.upsert({
        where: { restaurantId: id },
        create: {
          restaurantId: id,
          plan: SubscriptionPlan.SMALL,
          status: SubscriptionStatus.ACTIVE,
          tableLimit,
          amount: 0,
          amountPaise: 0,
          startDate: new Date(),
          endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          notes: combinedNotes,
        },
        update: {
          tableLimit,
          notes: combinedNotes,
        },
      });
    }

    let updatedRestaurant = restaurant;
    if (Object.keys(dataToUpdate).length > 0) {
      updatedRestaurant = await prisma.restaurant.update({
        where: { id },
        data: dataToUpdate,
        include: {
          subscription: true,
          _count: {
            select: { tables: true },
          },
          tables: {
            select: { id: true, isActive: true },
          },
        },
      });
    }

    const effectiveLimit = updatedSubscription?.tableLimit ?? restaurant.subscription?.tableLimit ?? 10;
    const totalTables = restaurant._count.tables;
    const activeTables = restaurant.tables.filter((t) => t.isActive).length;

    return NextResponse.json({
      success: true,
      message: tableLimit !== undefined
        ? `Allowed tables updated to ${effectiveLimit} for ${restaurant.name}.`
        : "Restaurant updated successfully.",
      data: {
        ...updatedRestaurant,
        tableLimit: effectiveLimit,
        totalTables,
        activeTables,
        subscription: updatedSubscription,
      },
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
