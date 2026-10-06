import { NextResponse } from "next/server";
import fs from "fs/promises";
import { getRestaurantImageFilePath } from "@/lib/storage";

export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string; filename: string }>;
}

export async function GET(request: Request, context: RouteContext) {
  try {
    const { id: restaurantId, filename } = await context.params;

    const fileInfo = await getRestaurantImageFilePath(restaurantId, filename);
    if (!fileInfo) {
      return new NextResponse("Image not found", { status: 404 });
    }

    const fileBuffer = await fs.readFile(fileInfo.filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": fileInfo.mimeType,
        "Content-Length": fileBuffer.length.toString(),
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'",
      },
    });
  } catch (error) {
    console.error("Image serve error:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
