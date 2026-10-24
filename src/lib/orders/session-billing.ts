import { Prisma, OrderStatus, DiningSessionStatus, OrderPaymentStatus, TaxCalculationMode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { calculateMixedOrderTax, TaxLineItem } from "@/lib/orders/tax";

export interface CombinedBillItem {
  id: string; // generated unique id or menuItemId
  menuItemId?: string | null;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  taxRate?: number;
  taxAmount?: number;
  taxableAmount?: number;
  notes?: string[] | null;
  fromOrderNumbers: string[];
}

export interface IndividualOrderSummary {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  itemsCount: number;
  itemsSummary: string;
}

export interface CombinedSessionBill {
  sessionId: string;
  sessionCode: string;
  status: DiningSessionStatus | string;
  sessionStatus?: string;
  paymentStatus: OrderPaymentStatus | string;
  paymentMethod: string | null;
  paidAt: string | null;
  confirmedById: string | null;
  receiptNumber: string | null;
  createdAt: string;
  table: {
    id?: string;
    tableNumber: string;
    name?: string | null;
  } | null;
  restaurant: {
    id?: string;
    name: string;
    slug: string;
    phone?: string | null;
    address?: string | null;
    gstEnabled: boolean;
    gstin: string | null;
    legalName: string | null;
    taxRate: number;
    taxMode: TaxCalculationMode | string;
  };
  orderCount: number;
  orderNumbers: string[];
  individualOrders: IndividualOrderSummary[];
  combinedItems: CombinedBillItem[];
  items: CombinedBillItem[];
  subtotal: number;
  discountAmount: number;
  taxableAmount: number;
  taxRate: number;
  taxAmount: number;
  taxMode: TaxCalculationMode | string;
  cgstAmount: number;
  sgstAmount: number;
  totalAmount: number;
  totalItemsCount: number;
  isPaid: boolean;
  isPaymentRequested?: boolean;
  billRequestedAt?: string | null;
}

export type CombinedSessionBillData = CombinedSessionBill;

/**
 * Generate a unique session code e.g. SES-20261024-ABCD
 */
export function generateSessionCode(): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `SES-${dateStr}-${rand}`;
}

/**
 * Generate a unique consolidated receipt number e.g. REC-20261024-ABCDE
 */
export function generateReceiptNumber(_prefix?: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `REC-${dateStr}-${rand}`;
}

/**
 * Finds or creates an active dining session for a table.
 * If an active session exists (status=ACTIVE and paymentStatus=PENDING), it is reused.
 * Once payment is confirmed (paymentStatus=PAID), a subsequent order will automatically start a new session.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function getOrCreateActiveDiningSession(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  dbClient: any,
  params: {
    restaurantId: string;
    tableId?: string | null;
  }
) {
  const { restaurantId, tableId } = params;

  if (tableId) {
    // 1. Concurrency/Lifecycle check: If table bill is already requested for payment, lock further orders
    const paymentRequested = await dbClient.diningSession.findFirst({
      where: {
        restaurantId,
        tableId,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        paymentStatus: OrderPaymentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });

    if (paymentRequested) {
      throw new Error(
        "BILL_LOCKED: The final bill has already been requested for this table. Please contact restaurant staff to order more."
      );
    }

    const existingActive = await dbClient.diningSession.findFirst({
      where: {
        restaurantId,
        tableId,
        status: DiningSessionStatus.ACTIVE,
        paymentStatus: OrderPaymentStatus.PENDING,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingActive) {
      return existingActive;
    }
  }

  // Create brand new session
  let sessionCode = generateSessionCode();
  // Ensure uniqueness in rare collision
  let attempts = 0;
  while (attempts < 3) {
    const conflict = await dbClient.diningSession.findUnique({
      where: { sessionCode },
    });
    if (!conflict) break;
    sessionCode = generateSessionCode();
    attempts++;
  }

  return await dbClient.diningSession.create({
    data: {
      sessionCode,
      restaurantId,
      tableId: tableId || null,
      status: DiningSessionStatus.ACTIVE,
      paymentStatus: OrderPaymentStatus.PENDING,
    },
  });
}

/**
 * Consolidates all orders of a dining session into one single running bill.
 * Aggregates duplicate items (e.g., 1 Pizza + 1 Pizza = 2 Pizzas),
 * recalculates combined subtotal, discounts, GST (CGST/SGST), and grand total.
 */
export function calculateCombinedSessionBill(params: {
  session: {
    id: string;
    sessionCode: string;
    status: DiningSessionStatus | string;
    paymentStatus: OrderPaymentStatus | string;
    paymentMethod?: string | null;
    paidAt?: Date | string | null;
    billRequestedAt?: Date | string | null;
    confirmedById?: string | null;
    receiptNumber?: string | null;
    createdAt: Date | string;
    table?: {
      id?: string;
      tableNumber: string;
      name?: string | null;
    } | null;
  };
  restaurant: {
    id?: string;
    name: string;
    slug: string;
    phone?: string | null;
    address?: string | null;
    gstEnabled?: boolean;
    gstin?: string | null;
    legalName?: string | null;
    taxRate?: Prisma.Decimal | number | string;
    taxMode?: TaxCalculationMode | string;
  };
  orders?: Array<{
    id: string;
    orderNumber: string;
    status: OrderStatus | string;
    subtotal: Prisma.Decimal | number | string;
    discountAmount?: Prisma.Decimal | number | string | null;
    taxAmount: Prisma.Decimal | number | string;
    totalAmount: Prisma.Decimal | number | string;
    createdAt: Date | string;
    items: Array<{
      id: string;
      menuItemId?: string | null;
      itemName: string;
      quantity: number;
      unitPrice: Prisma.Decimal | number | string;
      subtotal: Prisma.Decimal | number | string;
      taxRate?: Prisma.Decimal | number | string | null;
      taxAmount?: Prisma.Decimal | number | string | null;
      taxableAmount?: Prisma.Decimal | number | string | null;
      notes?: string | null;
    }>;
  }>;
}): CombinedSessionBill {
  const { session, restaurant, orders } = params;
  const rawOrders = orders ?? (session as any).orders ?? [];

  // Filter out cancelled orders so only active dining orders count toward the bill
  const activeOrders = rawOrders.filter((o: any) => o.status !== OrderStatus.CANCELLED);

  // Group items by unique menuItemId or normalized itemName + unitPrice
  const itemMap = new Map<
    string,
    {
      id: string;
      menuItemId?: string | null;
      itemName: string;
      quantity: number;
      unitPrice: number;
      subtotal: number;
      taxRate?: number;
      notes: string[];
      fromOrderNumbers: Set<string>;
    }
  >();

  let totalDiscountDecimal = new Prisma.Decimal(0);

  for (const order of activeOrders) {
    if (order.discountAmount) {
      totalDiscountDecimal = totalDiscountDecimal.add(new Prisma.Decimal(order.discountAmount));
    }

    for (const item of order.items) {
      const uPrice = Number(item.unitPrice);
      const key = item.menuItemId
        ? `menu_${item.menuItemId}_${uPrice}`
        : `name_${item.itemName.trim().toLowerCase()}_${uPrice}`;

      const existing = itemMap.get(key);
      if (existing) {
        existing.quantity += item.quantity;
        existing.subtotal = Number((existing.subtotal + Number(item.subtotal)).toFixed(2));
        if (item.notes && item.notes.trim()) {
          existing.notes.push(item.notes.trim());
        }
        existing.fromOrderNumbers.add(order.orderNumber);
      } else {
        itemMap.set(key, {
          id: item.id,
          menuItemId: item.menuItemId || null,
          itemName: item.itemName,
          quantity: item.quantity,
          unitPrice: uPrice,
          subtotal: Number(item.subtotal),
          taxRate: item.taxRate ? Number(item.taxRate) : undefined,
          notes: item.notes && item.notes.trim() ? [item.notes.trim()] : [],
          fromOrderNumbers: new Set([order.orderNumber]),
        });
      }
    }
  }

  const combinedItems: CombinedBillItem[] = Array.from(itemMap.values()).map((v) => ({
    id: v.id,
    menuItemId: v.menuItemId,
    itemName: v.itemName,
    quantity: v.quantity,
    unitPrice: v.unitPrice,
    subtotal: v.subtotal,
    taxRate: v.taxRate,
    notes: v.notes.length > 0 ? v.notes : null,
    fromOrderNumbers: Array.from(v.fromOrderNumbers),
  }));

  // Prepare line items for mixed GST calculation engine
  const taxLineItems: TaxLineItem[] = combinedItems.map((ci) => ({
    menuItemId: ci.menuItemId || undefined,
    name: ci.itemName,
    price: new Prisma.Decimal(ci.unitPrice),
    quantity: ci.quantity,
    useCustomTaxRate: ci.taxRate !== undefined,
    taxRate: ci.taxRate !== undefined ? new Prisma.Decimal(ci.taxRate) : null,
  }));

  const taxSnapshot = calculateMixedOrderTax({
    items: taxLineItems,
    gstEnabled: !!restaurant.gstEnabled,
    restaurantTaxRate: Number(restaurant.taxRate || 0),
    taxMode: (restaurant.taxMode as TaxCalculationMode) || TaxCalculationMode.EXCLUSIVE,
    discountAmount: totalDiscountDecimal,
  });

  // Calculate item-level tax components matching the engine
  for (let i = 0; i < combinedItems.length; i++) {
    const calculated = taxSnapshot.items[i];
    if (calculated) {
      combinedItems[i].taxRate = Number(calculated.taxRate);
      combinedItems[i].taxAmount = Number(calculated.taxAmount);
      combinedItems[i].taxableAmount = Number(calculated.taxableAmount);
    }
  }

  const individualOrders: IndividualOrderSummary[] = activeOrders.map((o: any) => {
    const summary = (o.items || []).map((i: any) => `${i.quantity}x ${i.itemName}`).join(", ");
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      status: o.status,
      createdAt: typeof o.createdAt === "string" ? o.createdAt : o.createdAt.toISOString(),
      subtotal: Number(o.subtotal),
      discountAmount: Number(o.discountAmount || 0),
      taxAmount: Number(o.taxAmount),
      totalAmount: Number(o.totalAmount),
      itemsCount: (o.items || []).reduce((acc: number, i: any) => acc + i.quantity, 0),
      itemsSummary: summary,
    };
  });

  const totalItemsCount = combinedItems.reduce((acc, i) => acc + i.quantity, 0);

  return {
    sessionId: session.id,
    sessionCode: session.sessionCode,
    status: session.status,
    paymentStatus: session.paymentStatus,
    paymentMethod: session.paymentMethod || null,
    paidAt: session.paidAt ? (typeof session.paidAt === "string" ? session.paidAt : session.paidAt.toISOString()) : null,
    confirmedById: session.confirmedById || null,
    receiptNumber: session.receiptNumber || null,
    createdAt: session.createdAt
      ? typeof session.createdAt === "string"
        ? session.createdAt
        : session.createdAt.toISOString()
      : new Date().toISOString(),
    table: session.table || null,
    restaurant: {
      id: restaurant?.id || "",
      name: restaurant?.name || "",
      slug: restaurant?.slug || "",
      phone: restaurant?.phone || null,
      address: restaurant?.address || null,
      gstEnabled: !!restaurant?.gstEnabled,
      gstin: restaurant?.gstin || null,
      legalName: restaurant?.legalName || null,
      taxRate: Number(restaurant?.taxRate || 0),
      taxMode: (restaurant?.taxMode as TaxCalculationMode) || "EXCLUSIVE",
    },
    orderCount: individualOrders.length,
    orderNumbers: individualOrders.map((o) => o.orderNumber),
    individualOrders,
    combinedItems,
    items: combinedItems,
    subtotal: Number(taxSnapshot.subtotal),
    discountAmount: Number(taxSnapshot.discountAmount || 0),
    taxableAmount: Number(taxSnapshot.taxableAmount),
    taxRate: Number(taxSnapshot.taxRate),
    taxAmount: Number(taxSnapshot.taxAmount),
    taxMode: taxSnapshot.taxMode,
    cgstAmount: Number(taxSnapshot.cgstAmount),
    sgstAmount: Number(taxSnapshot.sgstAmount),
    totalAmount: Number(taxSnapshot.totalAmount),
    totalItemsCount,
    isPaid: session.paymentStatus === OrderPaymentStatus.PAID,
    isPaymentRequested: session.status === DiningSessionStatus.PAYMENT_REQUESTED || (session.status as string) === "PAYMENT_REQUESTED",
    billRequestedAt: session.billRequestedAt
      ? new Date(session.billRequestedAt).toISOString()
      : null,
  };
}

/**
 * Confirms counter payment for a table's active dining session.
 * Idempotent with row locking: if already paid, returns existing receipt without re-processing.
 * Marks session as PAID, generates unique consolidated receiptNumber, and marks orders COMPLETED.
 */
export async function confirmSessionPaymentAtCounter(
  params: {
    restaurantId: string;
    tableId?: string;
    sessionId?: string;
    paymentMethod?: string;
    confirmedByUserId?: string | null;
    staffUserId?: string | null;
    notes?: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    dbClient?: any;
  },
  dbOverride?: any
) {
  const {
    restaurantId,
    tableId,
    sessionId,
    paymentMethod = "COUNTER_CASH",
    confirmedByUserId,
    staffUserId,
    notes,
  } = params;

  const client = dbOverride || params.dbClient || prisma;
  const effectiveStaffId = confirmedByUserId || staffUserId || null;

  return await client.$transaction(async (tx: any) => {
    // 1. Locate the dining session
    let targetSessionId = sessionId;

    if (!targetSessionId && tableId) {
      const activeForTable = await tx.diningSession.findFirst({
        where: {
          restaurantId,
          tableId,
          status: { in: [DiningSessionStatus.ACTIVE, DiningSessionStatus.PAYMENT_REQUESTED] },
          paymentStatus: OrderPaymentStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
      });

      if (!activeForTable) {
        // Check if there was a recently paid session
        const recentlyPaid = await tx.diningSession.findFirst({
          where: {
            restaurantId,
            tableId,
            status: DiningSessionStatus.COMPLETED,
            paymentStatus: OrderPaymentStatus.PAID,
          },
          orderBy: { updatedAt: "desc" },
        });

        if (recentlyPaid) {
          targetSessionId = recentlyPaid.id;
        } else {
          throw new Error("No active dining session found for this table to confirm payment.");
        }
      } else {
        targetSessionId = activeForTable.id;
      }
    }

    if (!targetSessionId) {
      throw new Error("Session ID or Table ID required to confirm payment.");
    }

    // 2. Lock the DiningSession row to serialize concurrent payment confirmations
    if (typeof tx.$executeRaw === "function") {
      try {
        await tx.$executeRaw`SELECT id FROM "DiningSession" WHERE id = ${targetSessionId} FOR UPDATE`;
      } catch {
        // Ignore in non-Postgres / test mocks
      }
    }

    const session = await tx.diningSession.findUnique({
      where: { id: targetSessionId },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            name: true,
          },
        },
        orders: {
          include: {
            items: true,
          },
          orderBy: { createdAt: "asc" },
        },
        restaurant: {
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
        },
      },
    });

    if (!session || session.restaurantId !== restaurantId) {
      throw new Error("Dining session not found for this restaurant.");
    }

    // 3. Idempotency Check: if already paid, return existing consolidated receipt
    if (session.paymentStatus === OrderPaymentStatus.PAID) {
      const combinedBill = calculateCombinedSessionBill({
        session,
        restaurant: session.restaurant || {
          id: restaurantId,
          name: "Restaurant",
          slug: "restaurant",
          gstEnabled: false,
          taxRate: 0,
          taxMode: "EXCLUSIVE",
        },
        orders: session.orders,
      });

      return {
        success: true,
        isDuplicate: true,
        message: "Payment already confirmed for this dining session.",
        receiptNumber: session.receiptNumber,
        paidAt: session.paidAt?.toISOString() || session.updatedAt.toISOString(),
        paymentMethod: session.paymentMethod,
        paymentStatus: session.paymentStatus,
        totalAmount: Number(session.totalAmount),
        bill: combinedBill,
      };
    }

    // 4. Calculate final consolidated bill amounts
    const combinedBill = calculateCombinedSessionBill({
      session,
      restaurant: session.restaurant,
      orders: session.orders,
    });

    // 5. Generate unique receipt number
    let receiptNumber = session.receiptNumber || generateReceiptNumber();
    let attempts = 0;
    while (attempts < 3) {
      const conflict = await tx.diningSession.findUnique({
        where: { receiptNumber },
      });
      if (!conflict || conflict.id === session.id) break;
      receiptNumber = generateReceiptNumber();
      attempts++;
    }

    const paidAtDate = new Date();

    // 6. Update DiningSession to PAID and COMPLETED
    const updatedSession = await tx.diningSession.update({
      where: { id: session.id },
      data: {
        status: DiningSessionStatus.COMPLETED,
        paymentStatus: OrderPaymentStatus.PAID,
        paidAt: paidAtDate,
        paymentMethod,
        confirmedById: effectiveStaffId,
        receiptNumber,
        subtotal: combinedBill.subtotal,
        discountAmount: combinedBill.discountAmount,
        taxAmount: combinedBill.taxAmount,
        totalAmount: combinedBill.totalAmount,
        notes: notes || session.notes || null,
      },
      include: {
        table: {
          select: {
            id: true,
            tableNumber: true,
            name: true,
          },
        },
      },
    });

    // 7. Transition all non-cancelled orders in this session to COMPLETED
    await tx.order.updateMany({
      where: {
        diningSessionId: session.id,
        status: {
          notIn: [OrderStatus.CANCELLED, OrderStatus.COMPLETED],
        },
      },
      data: {
        status: OrderStatus.COMPLETED,
      },
    });

    // Reconstruct final bill with updated session data
    const finalBill = calculateCombinedSessionBill({
      session: {
        ...updatedSession,
        table: updatedSession.table,
      },
      restaurant: session.restaurant,
      orders: session.orders.map((o: any) => ({
        ...o,
        status: o.status === OrderStatus.CANCELLED ? OrderStatus.CANCELLED : OrderStatus.COMPLETED,
      })),
    });

    return {
      success: true,
      isDuplicate: false,
      message: `Payment confirmed successfully at counter for Table ${session.table?.tableNumber || "Direct"}. Final consolidated receipt generated.`,
      receiptNumber,
      paidAt: paidAtDate.toISOString(),
      paymentMethod,
      bill: finalBill,
    };
  });
}

/**
 * Customer requests the final bill for their table's active dining session.
 * Locks the session in PAYMENT_REQUESTED status to prevent new orders from silently altering the bill.
 * Creates a ServiceRequest ping for restaurant staff. Idempotent on repeated clicks.
 */
export async function requestFinalTableBill(
  params: {
    restaurantId: string;
    tableId?: string | null;
    sessionId?: string | null;
    orderNumber?: string | null;
  },
  dbOverride?: any
) {
  const client = dbOverride || prisma;
  const { restaurantId, tableId, sessionId, orderNumber } = params;

  return await client.$transaction(async (tx: any) => {
    let targetSessionId = sessionId;

    if (!targetSessionId && orderNumber) {
      const order = await tx.order.findUnique({
        where: { orderNumber },
        select: { diningSessionId: true, tableId: true },
      });
      if (order?.diningSessionId) {
        targetSessionId = order.diningSessionId;
      } else if (order?.tableId && !tableId) {
        const sessionForTable = await tx.diningSession.findFirst({
          where: {
            restaurantId,
            tableId: order.tableId,
            status: { in: [DiningSessionStatus.ACTIVE, DiningSessionStatus.PAYMENT_REQUESTED] },
            paymentStatus: OrderPaymentStatus.PENDING,
          },
          orderBy: { createdAt: "desc" },
        });
        if (sessionForTable) targetSessionId = sessionForTable.id;
      }
    }

    if (!targetSessionId && tableId) {
      const sessionForTable = await tx.diningSession.findFirst({
        where: {
          restaurantId,
          tableId,
          status: { in: [DiningSessionStatus.ACTIVE, DiningSessionStatus.PAYMENT_REQUESTED] },
          paymentStatus: OrderPaymentStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
      });
      if (sessionForTable) targetSessionId = sessionForTable.id;
    }

    if (!targetSessionId) {
      throw new Error("No active dining session found for this table to request bill.");
    }

    // Row-level lock if supported
    if (typeof tx.$executeRaw === "function") {
      try {
        await tx.$executeRaw`SELECT id FROM "DiningSession" WHERE id = ${targetSessionId} FOR UPDATE`;
      } catch {
        // Ignore mock
      }
    }

    const session = await tx.diningSession.findUnique({
      where: { id: targetSessionId },
      include: {
        table: { select: { id: true, tableNumber: true, name: true } },
        orders: {
          where: { status: { not: OrderStatus.CANCELLED } },
          include: { items: true },
          orderBy: { createdAt: "asc" },
        },
        restaurant: {
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
        },
      },
    });

    if (!session || session.restaurantId !== restaurantId) {
      throw new Error("Dining session not found for this restaurant.");
    }

    if (session.orders.length === 0) {
      throw new Error("Cannot request bill for a table with no active orders.");
    }

    // Idempotency: If already paid, return paid bill
    if (session.paymentStatus === OrderPaymentStatus.PAID) {
      const bill = calculateCombinedSessionBill({ session, restaurant: session.restaurant, orders: session.orders });
      return {
        success: true,
        isAlreadyPaid: true,
        receiptNumber: session.receiptNumber,
        bill,
      };
    }

    const bill = calculateCombinedSessionBill({ session, restaurant: session.restaurant, orders: session.orders });

    // Idempotency: If already in PAYMENT_REQUESTED, return bill idempotently
    if (session.status === DiningSessionStatus.PAYMENT_REQUESTED) {
      return {
        success: true,
        isAlreadyRequested: true,
        billRequestedAt: session.billRequestedAt?.toISOString() || session.updatedAt.toISOString(),
        bill: {
          ...bill,
          status: DiningSessionStatus.PAYMENT_REQUESTED,
          sessionStatus: DiningSessionStatus.PAYMENT_REQUESTED,
          isPaymentRequested: true,
        },
      };
    }

    // Update session to PAYMENT_REQUESTED
    const requestedAt = new Date();
    await tx.diningSession.update({
      where: { id: session.id },
      data: {
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        billRequestedAt: requestedAt,
        subtotal: bill.subtotal,
        discountAmount: bill.discountAmount,
        taxAmount: bill.taxAmount,
        totalAmount: bill.totalAmount,
      },
    });

    // Create ServiceRequest notification for restaurant staff
    if (session.tableId) {
      try {
        await tx.serviceRequest.create({
          data: {
            restaurantId,
            tableId: session.tableId,
            type: "OTHER",
            message: `Pay & Final Bill requested for Table #${session.table?.tableNumber || "Dine-In"} — ₹${bill.totalAmount.toFixed(2)}`,
            status: "PENDING",
          },
        });
      } catch {
        // Non-blocking
      }
    }

    return {
      success: true,
      isAlreadyRequested: false,
      billRequestedAt: requestedAt.toISOString(),
      bill: {
        ...bill,
        status: DiningSessionStatus.PAYMENT_REQUESTED,
        sessionStatus: DiningSessionStatus.PAYMENT_REQUESTED,
        isPaymentRequested: true,
      },
    };
  });
}

/**
 * Staff reopens a table's bill if customer wants to add more orders after requesting bill.
 * Transitions DiningSession back from PAYMENT_REQUESTED to ACTIVE.
 */
export async function reopenTableBill(
  params: {
    restaurantId: string;
    tableId?: string | null;
    sessionId?: string | null;
    staffUserId?: string | null;
  },
  dbOverride?: any
) {
  const client = dbOverride || prisma;
  const { restaurantId, tableId, sessionId } = params;

  return await client.$transaction(async (tx: any) => {
    let targetSessionId = sessionId;

    if (!targetSessionId && tableId) {
      const session = await tx.diningSession.findFirst({
        where: {
          restaurantId,
          tableId,
          status: DiningSessionStatus.PAYMENT_REQUESTED,
          paymentStatus: OrderPaymentStatus.PENDING,
        },
        orderBy: { createdAt: "desc" },
      });
      if (session) targetSessionId = session.id;
    }

    if (!targetSessionId) {
      throw new Error("No locked bill found to reopen for this table.");
    }

    const session = await tx.diningSession.findUnique({
      where: { id: targetSessionId },
    });

    if (!session || session.restaurantId !== restaurantId) {
      throw new Error("Dining session not found.");
    }

    if (session.paymentStatus === OrderPaymentStatus.PAID) {
      throw new Error("Cannot reopen a bill that has already been paid and completed.");
    }

    const updated = await tx.diningSession.update({
      where: { id: session.id },
      data: {
        status: DiningSessionStatus.ACTIVE,
        billRequestedAt: null,
      },
      include: {
        table: { select: { id: true, tableNumber: true, name: true } },
      },
    });

    return {
      success: true,
      message: "Table bill successfully reopened. Customer can place orders again.",
      data: updated,
    };
  });
}

