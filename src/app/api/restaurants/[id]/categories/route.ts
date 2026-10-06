import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { CreateCategorySchema } from "@/lib/validations/menu";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
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

    const categories = await prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants/[id]/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch menu categories." },
      { status: 500 }
    );
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

    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
    });

    if (!restaurant) {
      return NextResponse.json({ success: false, error: "Restaurant not found." }, { status: 404 });
    }

    const json = await request.json();
    const validation = CreateCategorySchema.safeParse(json);

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

    // Check duplicate name in this restaurant (case-insensitive)
    const existing = await prisma.menuCategory.findFirst({
      where: {
        restaurantId,
        name: {
          equals: name.trim(),
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      return NextResponse.json(
        {
          success: false,
          error: `A category named "${name.trim()}" already exists in your restaurant.`,
        },
        { status: 409 }
      );
    }

    const category = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: name.trim(),
        description: description?.trim() || null,
        sortOrder,
        isActive: isActive !== false,
      },
      include: {
        _count: {
          select: { items: true },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: "Category created successfully.",
        data: category,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("POST /api/restaurants/[id]/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create category." },
      { status: 500 }
    );
  }
}
