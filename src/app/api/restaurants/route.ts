import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/tenant";
import { CreateRestaurantSchema } from "@/lib/validations/restaurant";
import { prisma } from "@/lib/db/prisma";
import { ApprovalStatus, MembershipRole, UserRole } from "@prisma/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireAuth();

    if (user.role === UserRole.SUPER_ADMIN) {
      const allRestaurants = await prisma.restaurant.findMany({
        orderBy: { createdAt: "desc" },
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
      return NextResponse.json({
        success: true,
        data: allRestaurants,
      });
    }

    // Owner / Staff: fetch only restaurants where the user has membership
    const memberships = await prisma.restaurantMember.findMany({
      where: { userId: user.id },
      include: {
        restaurant: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const restaurants = memberships.map((m) => ({
      ...m.restaurant,
      membershipRole: m.role,
    }));

    return NextResponse.json({
      success: true,
      data: restaurants,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("GET /api/restaurants error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to retrieve restaurants." },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuth();

    const json = await request.json();
    const result = CreateRestaurantSchema.safeParse(json);

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

    const { name, slug, description, phone, email, address, googleReviewUrl } = result.data;

    // Check slug uniqueness
    const existingSlug = await prisma.restaurant.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      return NextResponse.json(
        {
          success: false,
          error: "A restaurant with this URL slug already exists. Please choose a different slug.",
        },
        { status: 409 }
      );
    }

    // Create restaurant with PENDING approval and INACTIVE status (strict rule)
    const restaurant = await prisma.restaurant.create({
      data: {
        name,
        slug,
        description,
        phone,
        email,
        address,
        googleReviewUrl: googleReviewUrl || null,
        approvalStatus: ApprovalStatus.PENDING,
        isActive: false, // Must be approved before activation
        isSuspended: false,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
        members: {
          create: {
            userId: user.id,
            role: MembershipRole.OWNER,
          },
        },
      },
      include: {
        members: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: restaurant,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json({ success: false, error: error.message }, { status: 401 });
    }
    console.error("POST /api/restaurants error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create restaurant." },
      { status: 500 }
    );
  }
}
