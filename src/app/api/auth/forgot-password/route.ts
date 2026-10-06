import { NextResponse } from "next/server";
import { ForgotPasswordSchema } from "@/lib/validations/auth";
import { createPasswordResetToken } from "@/lib/auth/reset";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = ForgotPasswordSchema.safeParse(json);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Validation failed",
          details: result.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    const { email } = result.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      // Return ambiguous generic success to prevent email enumeration
      return NextResponse.json({
        success: true,
        message: "If an account with that email exists, password reset instructions have been generated.",
      });
    }

    const token = await createPasswordResetToken(user);
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

    return NextResponse.json({
      success: true,
      message: "Password reset link generated successfully. Proceed to set your new password.",
      resetUrl,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred. Please try again.",
      },
      { status: 500 }
    );
  }
}
