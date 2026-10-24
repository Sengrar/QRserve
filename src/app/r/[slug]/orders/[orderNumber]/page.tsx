import React from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { verifyOrderAccessToken } from "@/lib/orders";
import { getSessionUser } from "@/lib/auth/session";
import { verifyRestaurantAccess } from "@/lib/security/tenant";
import { OrderConfirmationView } from "@/components/menu/OrderConfirmationView";
import { calculateCombinedSessionBill, CombinedSessionBillData } from "@/lib/orders/session-billing";
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

  const [restaurant, order] = await Promise.all([
    prisma.restaurant.findUnique({
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
    }),
    prisma.order.findUnique({
      where: { orderNumber },
      include: {
        table: { select: { id: true, tableNumber: true, name: true, qrToken: true } },
        diningSession: {
          select: {
            id: true,
            sessionCode: true,
            status: true,
            paymentStatus: true,
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
    }),
  ]);

  if (!restaurant || !order || order.restaurantId !== restaurant.id) {
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

  // Fetch combined bill data server-side to eliminate client fetch delay and render running bill immediately
  let initialBillData: CombinedSessionBillData | null = null;
  const targetSessionId = order.diningSessionId;
  const targetTableId = order.table?.id || order.tableId;

  let sessionRecord = null;
  if (targetSessionId) {
    sessionRecord = await prisma.diningSession.findFirst({
      where: {
        id: targetSessionId,
        restaurantId: restaurant.id,
      },
      include: {
        table: { select: { id: true, tableNumber: true, name: true } },
        orders: {
          include: { items: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
  } else if (targetTableId) {
    sessionRecord = await prisma.diningSession.findFirst({
      where: {
        restaurantId: restaurant.id,
        tableId: targetTableId,
        status: "ACTIVE",
        paymentStatus: "PENDING",
      },
      include: {
        table: { select: { id: true, tableNumber: true, name: true } },
        orders: {
          include: { items: true },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  if (sessionRecord && sessionRecord.orders.length > 0) {
    initialBillData = calculateCombinedSessionBill({
      session: sessionRecord,
      restaurant: {
        id: restaurant.id,
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
      orders: sessionRecord.orders,
    });
  }

  const effectiveQr = qr || order.table?.qrToken || null;

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
              qrToken: order.table.qrToken,
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
      qrToken={effectiveQr}
      orderAccessToken={token || null}
      initialCombinedBillData={initialBillData}
    />
  );
}
