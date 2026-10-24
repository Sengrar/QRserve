import { NextResponse } from "next/server";
import { RegisterSchema } from "@/lib/validations/auth";
import { hashPassword } from "@/lib/auth/password";
import { setSessionCookie, signSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { UserRole } from "@prisma/client";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = RegisterSchema.safeParse(json);

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

    const { name, email, password } = result.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        {
          success: false,
          error: "An account with this email already exists.",
        },
        { status: 409 }
      );
    }

    // Hash password securely with bcrypt
    const passwordHash = await hashPassword(password);

    // Strict security rule: Public self-registration ALWAYS creates RESTAURANT_OWNER
    // Never allow Super Admin role injection from public client
    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        role: UserRole.RESTAURANT_OWNER,
        isActive: true,
        termsAcceptedAt: new Date(),
        termsVersion: "v1.0",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        termsAcceptedAt: true,
        termsVersion: true,
        createdAt: true,
      },
    });

    // Create and sign secure session
    const token = await signSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    });

    await setSessionCookie(token);

    return NextResponse.json(
      {
        success: true,
        data: {
          user,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Registration error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred during registration.",
      },
      { status: 500 }
    );
  }
}
