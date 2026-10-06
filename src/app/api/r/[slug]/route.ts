import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant, evaluateRestaurantGovernance } from "@/lib/security/tenant";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        address: true,
        phone: true,
        logoUrl: true,
        bannerUrl: true,
        googleReviewUrl: true,
        approvalStatus: true,
        isActive: true,
        isSuspended: true,
        gstEnabled: true,
        gstin: true,
        legalName: true,
        taxRate: true,
        taxMode: true,
        subscription: {
          select: {
            status: true,
            endDate: true,
          },
        },
        categories: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            description: true,
            items: {
              where: { isAvailable: true },
              orderBy: { name: "asc" },
              select: {
                id: true,
                name: true,
                description: true,
                price: true,
                imageUrl: true,
                useCustomTaxRate: true,
                taxRate: true,
              },
            },
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        {
          success: false,
          code: "NOT_FOUND",
          error: "Restaurant not found.",
        },
        { status: 404 }
      );
    }

    const governance = evaluateRestaurantGovernance(restaurant);

    if (!canPubliclyAccessRestaurant(restaurant)) {
      let message = "This restaurant is not currently available for QR ordering.";
      let code = "UNAVAILABLE";

      if (governance.isSuspended) {
        message = "This restaurant is temporarily suspended.";
        code = "SUSPENDED";
      } else if (governance.isPending) {
        message = "This restaurant is pending administrative verification.";
        code = "PENDING_APPROVAL";
      } else if (governance.isRejected) {
        message = "This restaurant is not authorized to accept orders.";
        code = "REJECTED";
      } else if (!governance.isActive) {
        message = "This restaurant is currently closed / not accepting orders.";
        code = "INACTIVE";
      } else if (!governance.subscriptionValid) {
        message = "This restaurant's ordering service is currently inactive.";
        code = "SUBSCRIPTION_INACTIVE";
      }

      return NextResponse.json(
        {
          success: false,
          code,
          error: message,
          data: {
            name: restaurant.name,
            slug: restaurant.slug,
            status: governance,
          },
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        description: restaurant.description,
        address: restaurant.address,
        phone: restaurant.phone,
        logoUrl: restaurant.logoUrl,
        bannerUrl: restaurant.bannerUrl,
        googleReviewUrl: restaurant.googleReviewUrl,
        gstEnabled: restaurant.gstEnabled,
        gstin: restaurant.gstin,
        legalName: restaurant.legalName,
        taxRate: Number(restaurant.taxRate),
        taxMode: restaurant.taxMode,
        categories: restaurant.categories.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          items: c.items.map((item) => ({
            id: item.id,
            name: item.name,
            description: item.description,
            price: Number(item.price),
            imageUrl: item.imageUrl,
            useCustomTaxRate: item.useCustomTaxRate,
            taxRate: item.taxRate ? Number(item.taxRate) : null,
          })),
        })),
      },
    });
  } catch (error) {
    console.error("GET /api/r/[slug] error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
