import { NextResponse } from "next/server";
import { deleteSessionCookie } from "@/lib/auth/session";

export async function POST() {
  try {
    await deleteSessionCookie();
    return NextResponse.json({
      success: true,
      data: { message: "Successfully logged out." },
    });
  } catch (error) {
    console.error("Logout error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to log out.",
      },
      { status: 500 }
    );
  }
}
