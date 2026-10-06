import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus, MembershipRole, Prisma } from "@prisma/client";
import { UpdateRestaurantSettingsSchema } from "@/lib/validations/restaurant";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, id);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const restaurant = await prisma.restaurant.findUnique({
      where: { id },
      include: {
        members: {
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: restaurant });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: "Failed to fetch restaurant." }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, id, [
      MembershipRole.OWNER,
      MembershipRole.MANAGER,
    ]);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. Only owners and managers can modify restaurant settings." },
        { status: 403 }
      );
    }

    const json = await request.json();
    const result = UpdateRestaurantSettingsSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: result.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const currentRestaurant = await prisma.restaurant.findUnique({
      where: { id },
    });

    if (!currentRestaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const {
      isActive,
      name,
      description,
      phone,
      email,
      address,
      googleReviewUrl,
      gstEnabled,
      gstin,
      legalName,
      taxRate,
      taxMode,
    } = result.data;

    // Strict Business Rule Check:
    // Only approved, non-suspended restaurants can be activated by the owner
    if (isActive === true) {
      if (currentRestaurant.approvalStatus !== ApprovalStatus.APPROVED) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot activate restaurant: Restaurant is awaiting Super Admin approval.",
          },
          { status: 400 }
        );
      }
      if (currentRestaurant.isSuspended) {
        return NextResponse.json(
          {
            success: false,
            error: "Cannot activate restaurant: Restaurant has been suspended by administration.",
          },
          { status: 403 }
        );
      }
    }

    const updated = await prisma.restaurant.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(description !== undefined && { description }),
        ...(phone !== undefined && { phone }),
        ...(email !== undefined && { email }),
        ...(address !== undefined && { address }),
        ...(googleReviewUrl !== undefined && { googleReviewUrl: googleReviewUrl || null }),
        ...(isActive !== undefined && { isActive }),
        ...(gstEnabled !== undefined && { gstEnabled }),
        ...(gstin !== undefined && { gstin: gstin ? gstin.toUpperCase().trim() : null }),
        ...(legalName !== undefined && { legalName: legalName ? legalName.trim() : null }),
        ...(taxRate !== undefined && { taxRate: new Prisma.Decimal(taxRate) }),
        ...(taxMode !== undefined && { taxMode }),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        ...updated,
        taxRate: Number(updated.taxRate),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/restaurants/[id] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update restaurant." }, { status: 500 });
  }
}
