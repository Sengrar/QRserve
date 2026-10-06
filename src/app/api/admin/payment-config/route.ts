import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/security/tenant";
import { UpdatePaymentConfigSchema } from "@/lib/validations/subscription";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await requireSuperAdmin();

    let config = await prisma.systemPaymentConfig.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (!config) {
      config = await prisma.systemPaymentConfig.create({
        data: {
          upiId: "qrserve@upi",
          payeeName: "QRServe Platform",
          bankName: "HDFC Bank",
          accountNumber: "50200012345678",
          ifscCode: "HDFC0001234",
          accountType: "Current Account",
          instructions:
            "Please mention your Restaurant Name or Slug in the remarks. Enter the 12-digit UTR/Transaction Reference number after completing payment.",
        },
      });
    }

    return NextResponse.json({ success: true, data: config });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("GET /api/admin/payment-config error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const adminUser = await requireSuperAdmin();

    const json = await request.json();
    const validation = UpdatePaymentConfigSchema.safeParse(json);

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

    const { upiId, payeeName, bankName, accountNumber, ifscCode, accountType, instructions } =
      validation.data;

    let config = await prisma.systemPaymentConfig.findFirst({
      orderBy: { createdAt: "desc" },
    });

    if (config) {
      config = await prisma.systemPaymentConfig.update({
        where: { id: config.id },
        data: {
          upiId,
          payeeName,
          bankName,
          accountNumber,
          ifscCode,
          accountType,
          instructions: instructions || null,
          updatedById: adminUser.id,
        },
      });
    } else {
      config = await prisma.systemPaymentConfig.create({
        data: {
          upiId,
          payeeName,
          bankName,
          accountNumber,
          ifscCode,
          accountType,
          instructions: instructions || null,
          updatedById: adminUser.id,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Payment configuration updated successfully.",
      data: config,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "AuthenticationError" || error.name === "AuthorizationError")
    ) {
      const statusCode = "statusCode" in error ? (error.statusCode as number) : 403;
      return NextResponse.json({ success: false, error: error.message }, { status: statusCode });
    }
    console.error("PUT /api/admin/payment-config error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
