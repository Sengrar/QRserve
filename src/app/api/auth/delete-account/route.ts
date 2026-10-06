import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/security/tenant";
import { isUserDesignatedSuperAdmin } from "@/lib/security/tenant";
import { verifyPassword } from "@/lib/auth/password";
import { deleteSessionCookie } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const sessionUser = await requireAuth();

    const json = await request.json().catch(() => ({}));
    const password = typeof json.password === "string" ? json.password : "";

    if (!password) {
      return NextResponse.json(
        {
          success: false,
          error: "Password confirmation is required to delete your account.",
        },
        { status: 400 }
      );
    }

    // Retrieve user from database with memberships
    const user = await prisma.user.findUnique({
      where: { id: sessionUser.id },
      include: {
        memberships: {
          include: {
            restaurant: {
              include: {
                members: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "User account not found.",
        },
        { status: 404 }
      );
    }

    // Security Guard: Designated Super Admin account must NEVER be deleted
    if (isUserDesignatedSuperAdmin(user)) {
      return NextResponse.json(
        {
          success: false,
          error: "Action Denied: The designated platform Super Admin account cannot be deleted.",
        },
        { status: 403 }
      );
    }

    // Verify password for security confirmation
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Incorrect password. Account deletion aborted.",
        },
        { status: 401 }
      );
    }

    // Find restaurants where this user is the only member / sole owner
    const restaurantIdsToDelete: string[] = [];
    for (const membership of user.memberships) {
      // If user is owner and there are no other members (or all members belong to this user)
      const otherMembers = membership.restaurant.members.filter(
        (m) => m.userId !== user.id
      );
      if (otherMembers.length === 0) {
        restaurantIdsToDelete.push(membership.restaurantId);
      }
    }

    // Execute atomic cleanup transaction
    await prisma.$transaction(async (tx) => {
      // 1. Delete sole-owned restaurants (Prisma cascades tables, categories, items, orders, subscriptions)
      if (restaurantIdsToDelete.length > 0) {
        await tx.restaurant.deleteMany({
          where: { id: { in: restaurantIdsToDelete } },
        });
      }

      // 2. Delete user (Prisma cascades memberships, sessions, and sets reviewedPaymentRequests to null)
      await tx.user.delete({
        where: { id: user.id },
      });
    });

    // Revoke session cookie
    await deleteSessionCookie();

    return NextResponse.json({
      success: true,
      message: "Your account and associated data have been permanently deleted.",
    });
  } catch (error) {
    console.error("Delete account error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred while deleting your account.",
      },
      { status: 500 }
    );
  }
}
