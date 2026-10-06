import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant, evaluateRestaurantGovernance } from "@/lib/security/tenant";
import { PublicDigitalMenuView } from "@/components/menu/PublicDigitalMenuView";
import { Clock, ShieldAlert, Store } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PublicMenuPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ table?: string; qr?: string }>;
}

export default async function PublicMenuPage({
  params,
  searchParams,
}: PublicMenuPageProps) {
  const { slug } = await params;
  const { table: tableNumberQuery, qr: qrTokenQuery } = await searchParams;

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
    notFound();
  }

  const governance = evaluateRestaurantGovernance(restaurant);
  const isAccessible = canPubliclyAccessRestaurant(restaurant);

  if (!isAccessible) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-card rounded-3xl p-8 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/20">
            {governance.isSuspended ? (
              <ShieldAlert className="w-8 h-8 text-rose-400" />
            ) : governance.isPending ? (
              <Clock className="w-8 h-8 text-amber-400" />
            ) : (
              <Store className="w-8 h-8 text-slate-400" />
            )}
          </div>

          <div>
            <h1 className="text-xl font-black text-white">{restaurant.name}</h1>
            <p className="text-xs font-mono text-slate-500 mt-0.5">/r/{restaurant.slug}</p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 text-xs text-slate-300">
            {governance.isSuspended ? (
              <p className="text-rose-300">
                This restaurant is temporarily suspended by platform administration.
              </p>
            ) : governance.isPending ? (
              <p className="text-amber-300">
                This restaurant is currently pending administrative verification.
              </p>
            ) : !governance.isActive ? (
              <p className="text-slate-300">
                This restaurant is currently closed or not taking orders right now. Please check back later.
              </p>
            ) : (
              <p className="text-slate-300">
                This restaurant is not currently available for digital QR ordering.
              </p>
            )}
          </div>

          <Link
            href="/"
            className="inline-block text-xs font-semibold text-amber-400 hover:text-amber-300 transition"
          >
            ← Back to QRServe
          </Link>
        </div>
      </div>
    );
  }

  const formattedCategories = restaurant.categories.map((c) => ({
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
  }));

  // Resolve Table context strictly scoped to THIS restaurant
  let resolvedTable: { tableNumber: string; name: string | null } | null = null;
  let tableMessage: { type: "info" | "warning"; text: string } | null = null;

  if (qrTokenQuery) {
    const table = await prisma.table.findFirst({
      where: {
        restaurantId: restaurant.id,
        qrToken: qrTokenQuery,
      },
      select: {
        tableNumber: true,
        name: true,
        isActive: true,
        status: true,
      },
    });

    if (!table) {
      tableMessage = {
        type: "warning",
        text: "This table QR code is invalid or has been replaced. Please ask your server for assistance.",
      };
    } else if (!table.isActive || table.status === "INACTIVE") {
      tableMessage = {
        type: "warning",
        text: `Table ${table.tableNumber} is currently marked inactive and not accepting orders.`,
      };
    } else {
      resolvedTable = {
        tableNumber: table.tableNumber,
        name: table.name,
      };
    }
  } else if (tableNumberQuery) {
    const table = await prisma.table.findFirst({
      where: {
        restaurantId: restaurant.id,
        tableNumber: tableNumberQuery,
      },
      select: {
        tableNumber: true,
        name: true,
        isActive: true,
        status: true,
      },
    });

    if (table && table.isActive && table.status !== "INACTIVE") {
      resolvedTable = {
        tableNumber: table.tableNumber,
        name: table.name,
      };
    }
  }

  // Fetch valid, started, non-expired, and non-exhausted public coupon offers
  const now = new Date();
  const rawCoupons = await prisma.coupon.findMany({
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

  const publicOffers = rawCoupons
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

  return (
    <PublicDigitalMenuView
      restaurant={{
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
        categories: formattedCategories,
      }}
      tableNumber={resolvedTable?.tableNumber || null}
      tableName={resolvedTable?.name || null}
      qrToken={resolvedTable ? qrTokenQuery || null : null}
      tableMessage={tableMessage}
      offers={publicOffers}
    />
  );
}
