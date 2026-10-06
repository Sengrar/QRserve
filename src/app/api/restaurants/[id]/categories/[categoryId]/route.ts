import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { UpdateCategorySchema } from "@/lib/validations/menu";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; categoryId: string }>;
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, categoryId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Category not found." }, { status: 404 });
    }

    const json = await request.json();
    const validation = UpdateCategorySchema.safeParse(json);

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

    const { name, description, sortOrder, isActive } = validation.data;

    // Check duplicate name if renaming
    if (name && name.trim().toLowerCase() !== category.name.toLowerCase()) {
      const conflict = await prisma.menuCategory.findFirst({
        where: {
          restaurantId,
          name: {
            equals: name.trim(),
            mode: "insensitive",
          },
          id: { not: categoryId },
        },
      });

      if (conflict) {
        return NextResponse.json(
          {
            success: false,
            error: `Another category named "${name.trim()}" already exists.`,
          },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.menuCategory.update({
      where: { id: categoryId },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(description !== undefined && { description: description?.trim() || null }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(isActive !== undefined && { isActive }),
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Category updated successfully.",
      data: updated,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("PATCH /api/restaurants/[id]/categories/[categoryId] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update category." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId, categoryId } = await context.params;

    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return NextResponse.json({ success: false, error: "Category not found." }, { status: 404 });
    }

    // Critical Safety Guard against unintended data loss:
    // Categories containing menu items cannot be accidentally deleted.
    if (category._count.items > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete category "${category.name}" because it contains ${category._count.items} menu item(s). Please move or delete the items first.`,
        },
        { status: 400 }
      );
    }

    await prisma.menuCategory.delete({
      where: { id: categoryId },
    });

    return NextResponse.json({
      success: true,
      message: `Category "${category.name}" deleted successfully.`,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("DELETE /api/restaurants/[id]/categories/[categoryId] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete category." },
      { status: 500 }
    );
  }
}
