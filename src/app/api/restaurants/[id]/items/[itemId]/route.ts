import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { UpdateMenuItemSchema } from "@/lib/validations/menu";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; itemId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, itemId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    });

    if (!item || item.category.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Menu item not found." }, { status: 404 });
    }

    const json = await request.json();
    const validation = UpdateMenuItemSchema.safeParse(json);

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

    const {
      categoryId,
      name,
      description,
      price,
      imageUrl,
      isAvailable,
      useCustomTaxRate,
      taxRate,
    } = validation.data;

    // If changing category, verify target category belongs to this restaurant
    if (categoryId && categoryId !== item.categoryId) {
      const targetCategory = await prisma.menuCategory.findUnique({
        where: { id: categoryId },
      });

      if (!targetCategory || targetCategory.restaurantId !== restaurantId) {
        return NextResponse.json(
          {
            success: false,
            error: "Target category is not valid for this restaurant.",
          },
          { status: 400 }
        );
      }
    }

    const updated = await prisma.menuItem.update({
      where: { id: itemId },
      data: {
        ...(categoryId !== undefined && { categoryId }),
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(price !== undefined && { price: new Prisma.Decimal(price) }),
        ...(imageUrl !== undefined && { imageUrl: imageUrl?.trim() || null }),
        ...(isAvailable !== undefined && { isAvailable }),
        ...(useCustomTaxRate !== undefined && { useCustomTaxRate }),
        ...(useCustomTaxRate === false && taxRate === undefined && { taxRate: null }),
        ...(taxRate !== undefined && {
          taxRate: taxRate !== null ? new Prisma.Decimal(taxRate) : null,
        }),
      },
      include: {
        category: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Menu item updated successfully.",
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/restaurants/[id]/items/[itemId] error:", error);
    return NextResponse.json({ success: false, error: "Failed to update menu item." }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, itemId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const item = await prisma.menuItem.findUnique({
      where: { id: itemId },
      include: { category: true },
    });

    if (!item || item.category.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Menu item not found." }, { status: 404 });
    }

    await prisma.menuItem.delete({
      where: { id: itemId },
    });

    return NextResponse.json({
      success: true,
      message: `Menu item "${item.name}" deleted successfully.`,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("DELETE /api/restaurants/[id]/items/[itemId] error:", error);
    return NextResponse.json({ success: false, error: "Failed to delete menu item." }, { status: 500 });
  }
}
