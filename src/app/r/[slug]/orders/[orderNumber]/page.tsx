import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyOrderAccessToken } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth/session";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { OrderConfirmationView } from "@/components/menu/OrderConfirmationView";
import { ShieldAlert } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface OrderPageProps {
  params: Promise<{ slug: string; orderNumber: string }>;
  searchParams: Promise<{ token?: string; qr?: string }>;
}

export default async function CustomerOrderConfirmationPage({
  params,
  searchParams,
}: OrderPageProps) {
  const { slug, orderNumber } = await params;
  const { token, qr } = await searchParams;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      phone: true,
      address: true,
      gstEnabled: true,
      gstin: true,
      legalName: true,
      taxRate: true,
      taxMode: true,
    },
  });

  if (!restaurant) {
    notFound();
  }

  const order = await prisma.order.findUnique({
    where: { orderNumber },
    include: {
      table: { select: { tableNumber: true, name: true } },
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
  });

  if (!order || order.restaurantId !== restaurant.id) {
    notFound();
  }

  // Cryptographic token access verification to prevent order enumeration
  const isTokenValid = token ? verifyOrderAccessToken(orderNumber, restaurant.id, token) : false;

  let hasStaffAccess = false;
  if (!isTokenValid) {
    const sessionUser = await getSessionUser();
    if (sessionUser) {
      const access = await verifyRestaurantAccess(sessionUser.id, sessionUser.role, restaurant.id);
      hasStaffAccess = access.authorized;
    }
  }

  if (!isTokenValid && !hasStaffAccess) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="max-w-md w-full glass-card rounded-3xl p-8 border border-slate-800 text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/10 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/20">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Secure Receipt Verification Required</h1>
            <p className="text-xs text-slate-400 mt-1">
              To protect customer privacy, order receipts can only be viewed using the secure link provided upon checkout.
            </p>
          </div>
          <Link
            href={`/r/${restaurant.slug}`}
            className="inline-block px-4 py-2 rounded-xl text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 transition"
          >
            ← Return to Restaurant Menu
          </Link>
        </div>
      </div>
    );
  }

  return (
    <OrderConfirmationView
      order={{
        orderNumber: order.orderNumber,
        status: order.status,
        createdAt: order.createdAt.toISOString(),
        customerNotes: order.customerNotes,
        subtotal: Number(order.subtotal),
        taxRate: Number(order.taxRate),
        taxAmount: Number(order.taxAmount),
        taxMode: order.taxMode,
        taxableAmount: Number(order.taxableAmount),
        cgstAmount: Number(order.cgstAmount),
        sgstAmount: Number(order.sgstAmount),
        totalAmount: Number(order.totalAmount),
        table: order.table
          ? {
              tableNumber: order.table.tableNumber,
              name: order.table.name,
            }
          : null,
        restaurant: {
          name: restaurant.name,
          slug: restaurant.slug,
          phone: restaurant.phone,
          address: restaurant.address,
          gstEnabled: restaurant.gstEnabled,
          gstin: restaurant.gstin,
          legalName: restaurant.legalName,
          taxRate: Number(restaurant.taxRate),
          taxMode: restaurant.taxMode,
        },
        items: order.items.map((i) => ({
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
      }}
      qrToken={qr || null}
      orderAccessToken={token || null}
    />
  );
}
