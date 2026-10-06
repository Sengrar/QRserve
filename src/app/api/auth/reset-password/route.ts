import { NextResponse } from "next/server";
import { ResetPasswordSchema } from "@/lib/validations/auth";
import { verifyPasswordResetToken } from "@/lib/auth/reset";
import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db/prisma";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = ResetPasswordSchema.safeParse(json);

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

    const { token, password } = result.data;

    // Verify token validity, signature, expiration, and single-use hashPrefix
    const payload = await verifyPasswordResetToken(token);
    if (!payload) {
      return NextResponse.json(
        {
          success: false,
          error: "This password reset link is invalid, expired, or has already been used.",
        },
        { status: 400 }
      );
    }

    // Securely hash new password with bcrypt
    const passwordHash = await hashPassword(password);

    // Update password in database and revoke existing sessions
    await prisma.$transaction([
      prisma.user.update({
        where: { id: payload.userId },
        data: { passwordHash },
      }),
      prisma.session.deleteMany({
        where: { userId: payload.userId },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Your password has been successfully reset. You can now sign in with your new password.",
    });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred during password reset.",
      },
      { status: 500 }
    );
  }
}
