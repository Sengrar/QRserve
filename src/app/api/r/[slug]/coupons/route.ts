import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant } from "@/lib/security/tenant";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export interface PublicCouponOffer {
  code: string;
  description: string | null;
  discountType: "PERCENTAGE" | "FIXED";
  discountValue: number;
  minOrderSubtotal: number;
  maxDiscount: number | null;
  endDate: string | null;
}

/**
 * GET /api/r/[slug]/coupons
 * Returns active, started, non-expired, and non-exhausted promotional coupons
 * strictly scoped to this restaurant for public menu customer display.
 * No administrative data, internal IDs, or customer limits are exposed.
 */
export async function GET(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;

    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
        approvalStatus: true,
        isActive: true,
        isSuspended: true,
        subscription: {
          select: {
            status: true,
            endDate: true,
          },
        },
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, error: "Restaurant not found." },
        { status: 404 }
      );
    }

    if (!canPubliclyAccessRestaurant(restaurant)) {
      return NextResponse.json(
        { success: false, error: "This restaurant is currently not accepting public orders." },
        { status: 403 }
      );
    }

    const now = new Date();

    const coupons = await prisma.coupon.findMany({
      where: {
        restaurantId: restaurant.id,
        isActive: true,
        startDate: { lte: now },
        OR: [
          { endDate: null },
          { endDate: { gt: now } },
        ],
      },
      orderBy: [
        { discountValue: "desc" },
        { createdAt: "desc" },
      ],
      select: {
        code: true,
        description: true,
        discountType: true,
        discountValue: true,
        minOrderSubtotal: true,
        maxDiscount: true,
        endDate: true,
        usageLimit: true,
        usageCount: true,
      },
    });

    // Exclude coupons that have reached their global redemption limit
    const publicOffers: PublicCouponOffer[] = coupons
      .filter((c) => c.usageLimit === null || c.usageCount < c.usageLimit)
      .map((c) => ({
        code: c.code,
        description: c.description,
        discountType: c.discountType,
        discountValue: Number(c.discountValue),
        minOrderSubtotal: Number(c.minOrderSubtotal),
        maxDiscount: c.maxDiscount ? Number(c.maxDiscount) : null,
        endDate: c.endDate ? c.endDate.toISOString() : null,
      }));

    return NextResponse.json({
      success: true,
      data: publicOffers,
    });
  } catch (err) {
    console.error("Error fetching public restaurant coupons:", err);
    return NextResponse.json(
      { success: false, error: "Failed to fetch coupon offers." },
      { status: 500 }
    );
  }
}
