import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { canPubliclyAccessRestaurant, evaluateRestaurantGovernance } from "@/lib/security/tenant";
import { CreateServiceRequestSchema } from "@/lib/validations/service-request";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ slug: string }>;
}

function getServiceTypeLabel(type: string): string {
  switch (type) {
    case "CALL_WAITER":
      return "a waiter";
    case "WATER":
      return "water";
    case "CUTLERY":
      return "extra cutlery/plates";
    case "CLEANING":
      return "table cleaning";
    case "OTHER":
      return "assistance";
    default:
      return "service";
  }
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
      const gov = evaluateRestaurantGovernance(restaurant);
      let errorMsg = "This restaurant is not currently accepting requests.";
      if (gov.isSuspended) errorMsg = "This restaurant is currently suspended.";
      else if (gov.isPending) errorMsg = "This restaurant is pending administrative verification.";
      else if (!gov.isActive) errorMsg = "This restaurant is currently closed.";
      else if (!gov.subscriptionValid) errorMsg = "This restaurant's ordering service is currently inactive.";

      return NextResponse.json({ success: false, error: errorMsg }, { status: 403 });
    }

    // 2. Parse and validate body
    const body = await request.json();
    const validation = CreateServiceRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { qrToken, type, message } = validation.data;

    // 3. Strictly validate Table QR token scoped to THIS restaurant
    const table = await prisma.table.findFirst({
      where: {
        restaurantId: restaurant.id,
        qrToken: qrToken.trim(),
      },
      select: {
        id: true,
        tableNumber: true,
        name: true,
        isActive: true,
        status: true,
      },
    });

    if (!table) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid or expired table QR code. Please scan a valid table QR to request service.",
        },
        { status: 400 }
      );
    }

    if (!table.isActive || table.status === "INACTIVE") {
      return NextResponse.json(
        {
          success: false,
          error: `Table ${table.tableNumber} is currently marked inactive and cannot place service requests.`,
        },
        { status: 400 }
      );
    }

    // 4. Duplicate submission protection:
    // Check if an identical request type is already pending or in progress for this table within the last 60 seconds
    const recentDuplicate = await prisma.serviceRequest.findFirst({
      where: {
        restaurantId: restaurant.id,
        tableId: table.id,
        type,
        status: { in: ["PENDING", "IN_PROGRESS"] },
        createdAt: {
          gte: new Date(Date.now() - 60 * 1000), // within last 60 seconds
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (recentDuplicate) {
      return NextResponse.json(
        {
          success: false,
          code: "DUPLICATE_REQUEST",
          error: `A request for ${getServiceTypeLabel(type)} is already pending for Table ${table.tableNumber}. Our staff is on the way!`,
        },
        { status: 409 }
      );
    }

    // 5. Create the Service Request
    const serviceRequest = await prisma.serviceRequest.create({
      data: {
        restaurantId: restaurant.id,
        tableId: table.id,
        type,
        message: message ? message.trim() : null,
        status: "PENDING",
      },
      include: {
        table: {
          select: {
            tableNumber: true,
            name: true,
          },
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: `Your request for ${getServiceTypeLabel(type)} has been sent! A team member will attend to Table ${table.tableNumber} shortly.`,
        data: serviceRequest,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/r/[slug]/service-requests error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to submit service request. Please try again or notify staff directly." },
      { status: 500 }
    );
  }
}
