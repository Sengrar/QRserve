import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { CreateMenuItemSchema } from "@/lib/validations/menu";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";

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
    const categoryId = searchParams.get("categoryId") || undefined;
    const query = searchParams.get("q") || undefined;

    const items = await prisma.menuItem.findMany({
      where: {
        category: {
          restaurantId,
        },
        ...(categoryId && { categoryId }),
        ...(query && {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { description: { contains: query, mode: "insensitive" } },
          ],
        }),
      },
      orderBy: [{ category: { sortOrder: "asc" } }, { name: "asc" }],
      include: {
        category: {
          select: {
            id: true,
            name: true,
            isActive: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: items,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/items error:", error);
    return NextResponse.json({ success: false, error: "Failed to fetch menu items." }, { status: 500 });
  }
}

export async function POST(request: Request, context: RouteContext) {
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

    const json = await request.json();
    const validation = CreateMenuItemSchema.safeParse(json);

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

    // Tenant Isolation: Verify the category actually belongs to this restaurant
    const category = await prisma.menuCategory.findUnique({
      where: { id: categoryId },
    });

    if (!category || category.restaurantId !== restaurantId) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid category selected for this restaurant.",
        },
        { status: 400 }
      );
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId,
        name: name.trim(),
        description: description?.trim() || null,
        price: new Prisma.Decimal(price),
        imageUrl: imageUrl?.trim() || null,
        isAvailable: isAvailable !== false,
        useCustomTaxRate: Boolean(useCustomTaxRate),
        taxRate:
          Boolean(useCustomTaxRate) && taxRate !== undefined && taxRate !== null
            ? new Prisma.Decimal(taxRate)
            : null,
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

    return NextResponse.json(
      {
        success: true,
        message: "Menu item created successfully.",
        data: item,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("POST /api/restaurants/[id]/items error:", error);
    return NextResponse.json({ success: false, error: "Failed to create menu item." }, { status: 500 });
  }
}
