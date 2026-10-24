import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { canPubliclyAccessRestaurant, evaluateRestaurantGovernance } from "@/lib/security/tenant";
import { CreateOrderSchema } from "@/lib/validations/order";
import { generateOrderNumber, generateOrderAccessToken } from "@/lib/orders";
import { calculateMixedOrderTax } from "@/lib/orders/tax";
import { validateCouponEligibility } from "@/lib/coupons/calculator";
import { getOrCreateActiveDiningSession } from "@/lib/orders/session-billing";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const { slug } = await context.params;

    // 1. Fetch and validate Restaurant
    const restaurant = await prisma.restaurant.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        name: true,
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
      },
    });

    if (!restaurant) {
      return NextResponse.json(
        { success: false, code: "NOT_FOUND", error: "Restaurant not found." },
        { status: 404 }
      );
    }

    if (!canPubliclyAccessRestaurant(restaurant)) {
      const gov = evaluateRestaurantGovernance(restaurant);
      let errorMsg = "This restaurant is not currently accepting orders.";
      if (gov.isSuspended) errorMsg = "This restaurant is currently suspended.";
      else if (gov.isPending) errorMsg = "This restaurant is pending administrative verification.";
      else if (!gov.isActive) errorMsg = "This restaurant is currently closed.";
      else if (!gov.subscriptionValid) errorMsg = "This restaurant's ordering service is currently inactive.";

      return NextResponse.json(
        { success: false, code: "FORBIDDEN", error: errorMsg },
        { status: 403 }
      );
    }

    // 2. Validate Request Body
    const body = await request.json().catch(() => null);
    const parsed = CreateOrderSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          code: "VALIDATION_ERROR",
          error: issue ? issue.message : "Invalid order payload.",
        },
        { status: 400 }
      );
    }

    const {
      qrToken,
      tableId,
      tableNumber,
      customerNotes,
      idempotencyKey,
      couponCode,
      customerPhone,
      customerName,
      items: requestedItems,
    } = parsed.data;

    // 3. Idempotency Check: protect against duplicate submissions
    if (idempotencyKey) {
      const existingOrder = await prisma.order.findUnique({
        where: { idempotencyKey },
        include: {
          table: { select: { tableNumber: true, name: true, qrToken: true } },
          diningSession: {
            select: {
              id: true,
              sessionCode: true,
              status: true,
              paymentStatus: true,
            },
          },
          items: true,
        },
      });

      if (existingOrder && existingOrder.restaurantId === restaurant.id) {
        const accessToken = generateOrderAccessToken(existingOrder.orderNumber, restaurant.id);
        const tableUrlParams = new URLSearchParams();
        tableUrlParams.set("token", accessToken);
        if (existingOrder.table?.qrToken) {
          tableUrlParams.set("qr", existingOrder.table.qrToken);
        } else if (existingOrder.table?.tableNumber) {
          tableUrlParams.set("table", existingOrder.table.tableNumber);
        }
        const confirmationUrl = `/r/${restaurant.slug}/orders/${existingOrder.orderNumber}?${tableUrlParams.toString()}`;

        return NextResponse.json({
          success: true,
          code: "ORDER_EXISTS",
          data: {
            orderNumber: existingOrder.orderNumber,
            accessToken,
            status: existingOrder.status,
            createdAt: existingOrder.createdAt.toISOString(),
            table: existingOrder.table
              ? { tableNumber: existingOrder.table.tableNumber, name: existingOrder.table.name }
              : null,
            diningSession: existingOrder.diningSession
              ? {
                  id: existingOrder.diningSession.id,
                  sessionCode: existingOrder.diningSession.sessionCode,
                  status: existingOrder.diningSession.status,
                  paymentStatus: existingOrder.diningSession.paymentStatus,
                }
              : null,
            subtotal: Number(existingOrder.subtotal),
            discountAmount: Number(existingOrder.discountAmount || 0),
            couponCode: existingOrder.couponCode || null,
            taxRate: Number(existingOrder.taxRate),
            taxAmount: Number(existingOrder.taxAmount),
            taxMode: existingOrder.taxMode,
            taxableAmount: Number(existingOrder.taxableAmount),
            cgstAmount: Number(existingOrder.cgstAmount),
            sgstAmount: Number(existingOrder.sgstAmount),
            totalAmount: Number(existingOrder.totalAmount),
            customerNotes: existingOrder.customerNotes,
            items: existingOrder.items.map((i) => ({
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
            confirmationUrl,
          },
        });
      }
    }

    // 4. Resolve and Validate Table Context strictly
    let resolvedTable: { id: string; tableNumber: string; name: string | null; qrToken: string | null } | null = null;

    if (qrToken) {
      const table = await prisma.table.findFirst({
        where: {
          restaurantId: restaurant.id,
          qrToken,
        },
        select: {
          id: true,
          tableNumber: true,
          name: true,
          qrToken: true,
          isActive: true,
          status: true,
        },
      });

      if (!table) {
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_TABLE_QR",
            error: "The scanned table QR code is invalid or has expired.",
          },
          { status: 400 }
        );
      }

      if (!table.isActive || table.status === "INACTIVE") {
        return NextResponse.json(
          {
            success: false,
            code: "TABLE_INACTIVE",
            error: `Table ${table.tableNumber} is currently not accepting orders.`,
          },
          { status: 400 }
        );
      }

      resolvedTable = {
        id: table.id,
        tableNumber: table.tableNumber,
        name: table.name,
        qrToken: table.qrToken,
      };
    } else if (tableId) {
      const table = await prisma.table.findFirst({
        where: {
          restaurantId: restaurant.id,
          id: tableId,
        },
        select: {
          id: true,
          tableNumber: true,
          name: true,
          qrToken: true,
          isActive: true,
          status: true,
        },
      });

      if (table && table.isActive && table.status !== "INACTIVE") {
        resolvedTable = {
          id: table.id,
          tableNumber: table.tableNumber,
          name: table.name,
          qrToken: table.qrToken,
        };
      }
    } else if (tableNumber) {
      const table = await prisma.table.findFirst({
        where: {
          restaurantId: restaurant.id,
          tableNumber: tableNumber.trim(),
        },
        select: {
          id: true,
          tableNumber: true,
          name: true,
          qrToken: true,
          isActive: true,
          status: true,
        },
      });

      if (table && table.isActive && table.status !== "INACTIVE") {
        resolvedTable = {
          id: table.id,
          tableNumber: table.tableNumber,
          name: table.name,
          qrToken: table.qrToken,
        };
      }
    }

    // 5. Query and Authoritatively Validate Menu Items
    const uniqueItemIds = Array.from(new Set(requestedItems.map((i) => i.menuItemId)));

    const dbItems = await prisma.menuItem.findMany({
      where: {
        id: { in: uniqueItemIds },
      },
      select: {
        id: true,
        name: true,
        price: true,
        isAvailable: true,
        useCustomTaxRate: true,
        taxRate: true,
        category: {
          select: {
            restaurantId: true,
            isActive: true,
          },
        },
      },
    });

    const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

    // Check if any requested item is missing
    for (const reqItem of requestedItems) {
      const dbItem = dbItemMap.get(reqItem.menuItemId);
      if (!dbItem) {
        return NextResponse.json(
          {
            success: false,
            code: "ITEM_NOT_FOUND",
            error: "One or more dishes in your cart are no longer on the menu.",
          },
          { status: 400 }
        );
      }

      // Check tenant isolation: Dish must belong to THIS restaurant
      if (dbItem.category.restaurantId !== restaurant.id) {
        return NextResponse.json(
          {
            success: false,
            code: "TENANT_MISMATCH",
            error: "Dishes from other restaurants cannot be added to this order.",
          },
          { status: 400 }
        );
      }

      // Check dish and category availability
      if (!dbItem.isAvailable || !dbItem.category.isActive) {
        return NextResponse.json(
          {
            success: false,
            code: "ITEM_UNAVAILABLE",
            error: `"${dbItem.name}" is currently sold out or unavailable.`,
          },
          { status: 400 }
        );
      }
    }

    // Calculate preliminary gross subtotal from authoritative DB prices
    const preliminaryGrossSubtotal = requestedItems.reduce((acc, reqItem) => {
      const dbItem = dbItemMap.get(reqItem.menuItemId)!;
      return acc.add(new Prisma.Decimal(dbItem.price).mul(reqItem.quantity));
    }, new Prisma.Decimal("0.00"));

    // 6. Authoritative Coupon Verification & Discount Calculation
    let resolvedCoupon: {
      id: string;
      code: string;
      usageLimit: number | null;
      perCustomerLimit: number | null;
      discountAmount: Prisma.Decimal;
    } | null = null;

    if (couponCode) {
      const normCode = couponCode.toUpperCase().trim();
      const coupon = await prisma.coupon.findUnique({
        where: {
          restaurantId_code: {
            restaurantId: restaurant.id,
            code: normCode,
          },
        },
      });

      if (!coupon) {
        return NextResponse.json(
          {
            success: false,
            code: "INVALID_COUPON",
            error: `Coupon "${normCode}" is invalid for this restaurant.`,
          },
          { status: 400 }
        );
      }

      // Customer usage limit count
      let customerUsageCount = 0;
      if (coupon.perCustomerLimit && customerPhone) {
        customerUsageCount = await prisma.couponUsage.count({
          where: {
            couponId: coupon.id,
            customerIdentifier: customerPhone.trim(),
          },
        });
      }

      const evaluation = validateCouponEligibility(coupon, {
        subtotal: preliminaryGrossSubtotal,
        restaurantId: restaurant.id,
        customerIdentifier: customerPhone || null,
        customerUsageCount,
        now: new Date(),
      });

      if (!evaluation.valid) {
        return NextResponse.json(
          {
            success: false,
            code: evaluation.errorCode || "COUPON_INELIGIBLE",
            error: evaluation.error,
          },
          { status: 400 }
        );
      }

      resolvedCoupon = {
        id: coupon.id,
        code: coupon.code,
        usageLimit: coupon.usageLimit,
        perCustomerLimit: coupon.perCustomerLimit,
        discountAmount: evaluation.discountAmount,
      };
    }

    // 7. Authoritative Server-side Mixed Tax & Total Calculation
    const taxCalculationInput = requestedItems.map((reqItem) => {
      const dbItem = dbItemMap.get(reqItem.menuItemId)!;
      return {
        menuItemId: dbItem.id,
        name: dbItem.name,
        price: dbItem.price,
        quantity: reqItem.quantity,
        useCustomTaxRate: dbItem.useCustomTaxRate,
        taxRate: dbItem.taxRate,
        notes: reqItem.notes || null,
      };
    });

    const taxSnapshot = calculateMixedOrderTax({
      items: taxCalculationInput,
      gstEnabled: restaurant.gstEnabled,
      restaurantTaxRate: restaurant.taxRate,
      taxMode: restaurant.taxMode,
      discountAmount: resolvedCoupon ? resolvedCoupon.discountAmount : 0,
    });

    const calculatedTotalAmount = taxSnapshot.totalAmount;

    // Enforce non-negative order total
    if (calculatedTotalAmount.lessThan(0)) {
      return NextResponse.json(
        {
          success: false,
          code: "INVALID_AMOUNT",
          error: "Order total cannot be negative.",
        },
        { status: 400 }
      );
    }

    // 8. Atomic Database Transaction with Collision-Safe Order Number
    let newOrder;
    let attempts = 0;
    const maxAttempts = 5;

    while (!newOrder && attempts < maxAttempts) {
      attempts++;
      const candidateOrderNumber = generateOrderNumber();

      try {
        newOrder = await prisma.$transaction(async (tx) => {
          // Concurrency protection for coupon usage limit
          if (resolvedCoupon) {
            const currentCoupon = await tx.coupon.findUnique({
              where: { id: resolvedCoupon.id },
              select: { usageCount: true, usageLimit: true, isActive: true },
            });

            if (!currentCoupon || !currentCoupon.isActive) {
              throw new Error("COUPON_INACTIVE: This coupon is no longer active.");
            }

            if (
              currentCoupon.usageLimit !== null &&
              currentCoupon.usageCount >= currentCoupon.usageLimit
            ) {
              throw new Error(
                "COUPON_LIMIT_REACHED: This coupon has reached its maximum total redemptions."
              );
            }

            if (resolvedCoupon.perCustomerLimit && customerPhone) {
              const custCount = await tx.couponUsage.count({
                where: {
                  couponId: resolvedCoupon.id,
                  customerIdentifier: customerPhone.trim(),
                },
              });
              if (custCount >= resolvedCoupon.perCustomerLimit) {
                throw new Error(
                  `COUPON_CUSTOMER_LIMIT: Maximum usage limit (${resolvedCoupon.perCustomerLimit}) reached for this phone number.`
                );
              }
            }

            await tx.coupon.update({
              where: { id: resolvedCoupon.id },
              data: { usageCount: { increment: 1 } },
            });
          }

          let diningSessionId: string | null = null;
          if (resolvedTable?.id) {
            const activeSession = await getOrCreateActiveDiningSession(tx, {
              restaurantId: restaurant.id,
              tableId: resolvedTable.id,
            });
            diningSessionId = activeSession.id;
          }

          const created = await tx.order.create({
            data: {
              orderNumber: candidateOrderNumber,
              restaurantId: restaurant.id,
              tableId: resolvedTable?.id ?? null,
              diningSessionId,
              customerNotes: customerNotes || null,
              couponId: resolvedCoupon?.id ?? null,
              couponCode: resolvedCoupon?.code ?? null,
              discountAmount: taxSnapshot.discountAmount || new Prisma.Decimal("0.00"),
              customerPhone: customerPhone || null,
              customerName: customerName || null,
              subtotal: taxSnapshot.subtotal,
              taxRate: taxSnapshot.taxRate,
              taxAmount: taxSnapshot.taxAmount,
              taxMode: taxSnapshot.taxMode,
              taxableAmount: taxSnapshot.taxableAmount,
              cgstAmount: taxSnapshot.cgstAmount,
              sgstAmount: taxSnapshot.sgstAmount,
              totalAmount: calculatedTotalAmount,
              idempotencyKey: idempotencyKey || null,
              status: "SUBMITTED",
              items: {
                create: taxSnapshot.items.map((item) => ({
                  menuItemId: item.menuItemId,
                  itemName: item.itemName!,
                  quantity: item.quantity,
                  unitPrice: item.unitPrice,
                  subtotal: item.subtotal,
                  taxRate: item.taxRate,
                  taxAmount: item.taxAmount,
                  taxableAmount: item.taxableAmount,
                  notes: item.notes,
                })),
              },
            },
            include: {
              items: true,
              table: { select: { tableNumber: true, name: true, qrToken: true } },
              diningSession: {
                select: {
                  id: true,
                  sessionCode: true,
                  status: true,
                  paymentStatus: true,
                },
              },
            },
          });

          // Record CouponUsage audit row
          if (resolvedCoupon) {
            await tx.couponUsage.create({
              data: {
                couponId: resolvedCoupon.id,
                orderId: created.id,
                customerIdentifier: customerPhone?.trim() || "GUEST",
                discountAmount: taxSnapshot.discountAmount || new Prisma.Decimal("0.00"),
              },
            });
          }

          return created;
        });
      } catch (err: unknown) {
        if (err instanceof Error && err.message.startsWith("BILL_LOCKED:")) {
          const parts = err.message.split(": ");
          return NextResponse.json(
            {
              success: false,
              code: "BILL_LOCKED",
              error: parts[1] || "The final bill has already been requested for this table. Please contact staff to order more.",
            },
            { status: 409 }
          );
        }
        if (err instanceof Error && err.message.startsWith("COUPON_")) {
          const parts = err.message.split(": ");
          return NextResponse.json(
            { success: false, code: parts[0], error: parts[1] || "Coupon validation failed." },
            { status: 400 }
          );
        }
        // If unique constraint failed on orderNumber, retry with new candidate
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          (err.meta?.target as string[])?.includes("orderNumber")
        ) {
          continue;
        }
        // If idempotencyKey collision occurred during race condition, fetch and return
        if (
          idempotencyKey &&
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === "P2002" &&
          (err.meta?.target as string[])?.includes("idempotencyKey")
        ) {
          const raceOrder = await prisma.order.findUnique({
            where: { idempotencyKey },
            include: {
              table: { select: { tableNumber: true, name: true, qrToken: true } },
              diningSession: {
                select: {
                  id: true,
                  sessionCode: true,
                  status: true,
                  paymentStatus: true,
                },
              },
              items: true,
            },
          });
          if (raceOrder) {
            newOrder = raceOrder;
            break;
          }
        }
        throw err;
      }
    }

    if (!newOrder) {
      return NextResponse.json(
        {
          success: false,
          code: "CREATION_FAILED",
          error: "Failed to generate order reference. Please try again.",
        },
        { status: 500 }
      );
    }

    // 9. Generate Secure Tracking Token
    const accessToken = generateOrderAccessToken(newOrder.orderNumber, restaurant.id);

          const tableUrlParams = new URLSearchParams();
          tableUrlParams.set("token", accessToken);
          const effectiveQr = resolvedTable?.qrToken || newOrder.table?.qrToken;
          const effectiveTableNum = resolvedTable?.tableNumber || newOrder.table?.tableNumber;
          if (effectiveQr) {
            tableUrlParams.set("qr", effectiveQr);
          } else if (effectiveTableNum) {
            tableUrlParams.set("table", effectiveTableNum);
          }
          const confirmationUrl = `/r/${restaurant.slug}/orders/${newOrder.orderNumber}?${tableUrlParams.toString()}`;

          return NextResponse.json(
            {
              success: true,
              data: {
                orderNumber: newOrder.orderNumber,
                accessToken,
                status: newOrder.status,
                createdAt: newOrder.createdAt.toISOString(),
                table: newOrder.table
                  ? { tableNumber: newOrder.table.tableNumber, name: newOrder.table.name }
                  : null,
                diningSession: newOrder.diningSession
                  ? {
                      id: newOrder.diningSession.id,
                      sessionCode: newOrder.diningSession.sessionCode,
                      status: newOrder.diningSession.status,
                      paymentStatus: newOrder.diningSession.paymentStatus,
                    }
                  : null,
                subtotal: Number(newOrder.subtotal),
                discountAmount: Number(newOrder.discountAmount || 0),
                couponCode: newOrder.couponCode || null,
                taxRate: Number(newOrder.taxRate),
                taxAmount: Number(newOrder.taxAmount),
                taxMode: newOrder.taxMode,
                taxableAmount: Number(newOrder.taxableAmount),
                cgstAmount: Number(newOrder.cgstAmount),
                sgstAmount: Number(newOrder.sgstAmount),
                totalAmount: Number(newOrder.totalAmount),
                customerNotes: newOrder.customerNotes,
                items: newOrder.items.map((i) => ({
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
                confirmationUrl,
              },
            },
            { status: 201 }
          );
  } catch (error) {
    console.error("POST /api/r/[slug]/orders error:", error);
    return NextResponse.json(
      { success: false, error: "Internal server error while processing order." },
      { status: 500 }
    );
  }
}
