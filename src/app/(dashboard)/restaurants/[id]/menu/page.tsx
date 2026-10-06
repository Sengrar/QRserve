import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { RestaurantMenuManager } from "@/components/menu/RestaurantMenuManager";

export const dynamic = "force-dynamic";

interface MenuPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantMenuPage({ params }: MenuPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
  if (!access.authorized) {
    redirect("/dashboard");
  }

  const [restaurant, categories, items] = await Promise.all([
    prisma.restaurant.findUnique({
      where: { id: restaurantId },
    }),
    prisma.menuCategory.findMany({
      where: { restaurantId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        _count: {
          select: { items: true },
        },
      },
    }),
    prisma.menuItem.findMany({
      where: {
        category: {
          restaurantId,
        },
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
    }),
  ]);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantMenuManager
      restaurant={{
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        gstEnabled: restaurant.gstEnabled,
        taxRate: Number(restaurant.taxRate),
        taxMode: restaurant.taxMode,
      }}
      initialCategories={categories.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        sortOrder: c.sortOrder,
        isActive: c.isActive,
        _count: c._count,
      }))}
      initialItems={items.map((i) => ({
        id: i.id,
        categoryId: i.categoryId,
        name: i.name,
        description: i.description,
        price: Number(i.price),
        imageUrl: i.imageUrl,
        isAvailable: i.isAvailable,
        useCustomTaxRate: i.useCustomTaxRate,
        taxRate: i.taxRate ? Number(i.taxRate) : null,
        category: {
          id: i.category.id,
          name: i.category.name,
          isActive: i.category.isActive,
        },
      }))}
    />
  );
}
