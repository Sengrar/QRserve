import { NextResponse } from "next/server";
import { LoginSchema } from "@/lib/validations/auth";
import { verifyPassword } from "@/lib/auth/password";
import { setSessionCookie, signSessionToken } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { isUserDesignatedSuperAdmin } from "@/lib/security/tenant";

export async function POST(request: Request) {
  try {
    const json = await request.json();
    const result = LoginSchema.safeParse(json);

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

    const { email, password } = result.data;
    const portal = typeof json.portal === "string" ? json.portal : undefined;

    // Retrieve user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    if (!user.isActive) {
      return NextResponse.json(
        {
          success: false,
          error: "This account has been deactivated. Please contact support.",
        },
        { status: 403 }
      );
    }

    // Verify hashed password
    const isPasswordValid = await verifyPassword(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        {
          success: false,
          error: "Invalid email or password.",
        },
        { status: 401 }
      );
    }

    // If logging into the dedicated Super Admin Portal, enforce designated Super Admin identity
    if (portal === "super_admin" && !isUserDesignatedSuperAdmin(user)) {
      return NextResponse.json(
        {
          success: false,
          error: "Access Denied: This portal is strictly reserved for the designated Super Admin. Restaurant owners must sign in through the restaurant login page.",
        },
        { status: 403 }
      );
    }

    // Sign and set session cookie
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
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Login error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "An unexpected error occurred during login.",
      },
      { status: 500 }
    );
  }
}
