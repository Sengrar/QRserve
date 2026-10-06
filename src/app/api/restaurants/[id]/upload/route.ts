import { NextResponse } from "next/server";
import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";
import { validateImageBuffer, saveRestaurantImage, MAX_FILE_SIZE_BYTES } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, context: RouteContext) {
  try {
    const user = await requireAuth();
    const { id: restaurantId } = await context.params;

    // Tenant authorization check: verify user owns or manages this restaurant
    const access = await verifyRestaurantAccess(user.id, user.role, restaurantId);
    if (!access.authorized) {
      return NextResponse.json(
        { success: false, error: "Access denied. You do not own or manage this restaurant." },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { success: false, error: "No image file provided." },
        { status: 400 }
      );
    }

    const fileObj = file as File;

    if (fileObj.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { success: false, error: "Image size exceeds the 5MB maximum limit." },
        { status: 400 }
      );
    }

    if (fileObj.size === 0) {
      return NextResponse.json(
        { success: false, error: "Selected file is empty." },
        { status: 400 }
      );
    }

    const arrayBuffer = await fileObj.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate binary magic bytes and file structure
    const validation = validateImageBuffer(buffer, fileObj.type);
    if (!validation.valid) {
      return NextResponse.json(
        { success: false, error: validation.error },
        { status: 400 }
      );
    }

    // Save image to tenant storage and obtain serving URL
    const saved = await saveRestaurantImage(restaurantId, buffer, validation.extension);

    return NextResponse.json(
      {
        success: true,
        data: saved,
      },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === "AuthenticationError") {
      return NextResponse.json(
        { success: false, error: "Authentication required." },
        { status: 401 }
      );
    }

    console.error("Image upload error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to upload image. Please try again." },
      { status: 500 }
    );
  }
}
