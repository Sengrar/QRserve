import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getSessionUser();
    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: "Not authenticated",
        },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        memberships: {
          include: {
            restaurant: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "Account not found or inactive",
        },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
        restaurants: user.memberships.map((m) => ({
          ...m.restaurant,
          role: m.role,
        })),
      },
    });
  } catch (error) {
    console.error("Auth me error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch user session",
      },
      { status: 500 }
    );
  }
}
