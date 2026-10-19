import { NextResponse } from "next/server";
import { ForgotPasswordSchema } from "@/lib/validations/auth";
import { createPasswordResetToken } from "@/lib/auth/reset";
import { prisma } from "@/lib/db/prisma";
import { isEmailDeliveryConfigured, sendPasswordResetEmail } from "@/lib/email";

// Simple in-memory sliding window rate limiter
const requestTimestamps = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

function isRateLimited(identifier: string): boolean {
  const now = Date.now();
  const timestamps = requestTimestamps.get(identifier) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);

  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  validTimestamps.push(now);
  requestTimestamps.set(identifier, validTimestamps);
  return false;
}

export async function POST(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "localhost";

    if (isRateLimited(ip)) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many password reset requests. Please wait a few minutes before trying again.",
        },
        { status: 429 }
      );
    }

    const json = await request.json().catch(() => null);
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
    const normalizedEmail = email.toLowerCase().trim();

    if (isRateLimited(normalizedEmail)) {
      return NextResponse.json(
        {
          success: false,
          error: "Too many password reset requests for this email. Please wait a few minutes.",
        },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      select: {
        id: true,
        email: true,
        name: true,
        passwordHash: true,
        isActive: true,
      },
    });

    // Generic response message: never reveals if email exists or not
    const genericResponse = {
      success: true,
      message:
        "If an account is associated with this email address, you will receive password reset instructions shortly.",
      emailConfigured: isEmailDeliveryConfigured(),
    };

    if (!user || !user.isActive) {
      return NextResponse.json(genericResponse);
    }

    const token = await createPasswordResetToken(user);
    const origin =
      request.headers.get("origin") ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";
    const resetUrl = `${origin}/reset-password?token=${encodeURIComponent(token)}`;

    if (isEmailDeliveryConfigured()) {
      await sendPasswordResetEmail({
        toEmail: user.email,
        recipientName: user.name,
        resetUrl,
      });
    } else if (process.env.NODE_ENV === "development") {
      // In local development, log to server terminal for developer convenience
      console.log(`\n========================================================`);
      console.log(`[QRServe Dev] Password reset generated for: ${user.email}`);
      console.log(`[QRServe Dev] Reset URL: ${resetUrl}`);
      console.log(`========================================================\n`);
    }

    // Secure return: Never expose reset token or resetUrl in the HTTP response
    return NextResponse.json(genericResponse);
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
