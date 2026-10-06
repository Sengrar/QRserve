import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { evaluateSubscriptionStatus } from "@/lib/subscription/status";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();

    const [subscriptions, paymentRequests] = await Promise.all([
      prisma.subscription.findMany({
        orderBy: { updatedAt: "desc" },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              approvalStatus: true,
              isActive: true,
              isSuspended: true,
              members: {
                where: { role: "OWNER" },
                include: {
                  user: {
                    select: { id: true, name: true, email: true },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.subscriptionPaymentRequest.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          restaurant: {
            select: {
              id: true,
              name: true,
              slug: true,
              approvalStatus: true,
            },
          },
          reviewedBy: {
            select: { id: true, name: true, email: true },
          },
        },
      }),
    ]);

    const formattedSubscriptions = subscriptions.map((s) => ({
      ...s,
      evaluated: evaluateSubscriptionStatus(s),
    }));

    return NextResponse.json({
      success: true,
      data: {
        subscriptions: formattedSubscriptions,
        paymentRequests,
      },
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("GET /api/admin/subscriptions error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
