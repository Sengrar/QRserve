import React from "react";
import { notFound, redirect } from "next/navigation";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { prisma } from "@/lib/db/prisma";
import { RestaurantOrderManager } from "@/components/orders/RestaurantOrderManager";
import { MembershipRole } from "@prisma/client";

export const dynamic = "force-dynamic";

interface OrdersPageProps {
  params: Promise<{ id: string }>;
}

export default async function RestaurantOrdersPage({ params }: OrdersPageProps) {
  const user = await requireAuth();
  const { id: restaurantId } = await params;

  // Strict tenant authorization
  const access = await verifyRestaurantAccess(user.id, user.role, restaurantId, [
    MembershipRole.OWNER,
    MembershipRole.MANAGER,
    MembershipRole.STAFF,
  ]);

  if (!access.authorized) {
    redirect("/dashboard");
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { id: restaurantId },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!restaurant) {
    notFound();
  }

  const initialOrders = await prisma.order.findMany({
    where: { restaurantId },
    include: {
      table: {
        select: {
          tableNumber: true,
          name: true,
        },
      },
      items: {
        select: {
          id: true,
          itemName: true,
          quantity: true,
          unitPrice: true,
          subtotal: true,
          taxRate: true,
          taxAmount: true,
          taxableAmount: true,
          notes: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return (
    <RestaurantOrderManager
      restaurant={restaurant}
      initialOrders={initialOrders.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerNotes: o.customerNotes,
        subtotal: Number(o.subtotal),
        discountAmount: Number(o.discountAmount || 0),
        couponCode: o.couponCode || null,
        taxRate: Number(o.taxRate),
        taxAmount: Number(o.taxAmount),
        taxMode: o.taxMode,
        taxableAmount: Number(o.taxableAmount),
        cgstAmount: Number(o.cgstAmount),
        sgstAmount: Number(o.sgstAmount),
        totalAmount: Number(o.totalAmount),
        createdAt: o.createdAt.toISOString(),
        updatedAt: o.updatedAt.toISOString(),
        table: o.table
          ? {
              tableNumber: o.table.tableNumber,
              name: o.table.name,
            }
          : null,
        items: o.items.map((i) => ({
          id: i.id,
          itemName: i.itemName,
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
          subtotal: Number(i.subtotal),
          taxRate: Number(i.taxRate),
          taxAmount: Number(i.taxAmount),
          taxableAmount: Number(i.taxableAmount),
          notes: i.notes,
        })),
      }))}
    />
  );
}
