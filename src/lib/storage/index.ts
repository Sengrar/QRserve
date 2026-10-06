import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_MIME_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp"] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export interface ValidationSuccess {
  valid: true;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
}

export interface ValidationFailure {
  valid: false;
  error: string;
}

export type ImageValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Validates file buffer against known image magic numbers and MIME types.
 * Prevents file extension spoofing and non-image payloads.
 */
export function validateImageBuffer(buffer: Buffer, declaredMimeType?: string): ImageValidationResult {
  if (!buffer || buffer.length === 0) {
    return { valid: false, error: "File is empty." };
  }

  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    return { valid: false, error: "File size exceeds the 5MB maximum limit." };
  }

  if (
    declaredMimeType &&
    !ALLOWED_MIME_TYPES.includes(declaredMimeType.toLowerCase() as AllowedMimeType)
  ) {
    return { valid: false, error: "Unsupported file type. Only JPG, PNG, and WebP are allowed." };
  }

  // 1. Check JPEG magic bytes: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { valid: true, mimeType: "image/jpeg", extension: "jpg" };
  }

  // 2. Check PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { valid: true, mimeType: "image/png", extension: "png" };
  }

  // 3. Check WebP magic bytes: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && // R
    buffer[1] === 0x49 && // I
    buffer[2] === 0x46 && // F
    buffer[3] === 0x46 && // F
    buffer[8] === 0x57 && // W
    buffer[9] === 0x45 && // E
    buffer[10] === 0x42 && // B
    buffer[11] === 0x50 // P
  ) {
    return { valid: true, mimeType: "image/webp", extension: "webp" };
  }

  return {
    valid: false,
    error: "Invalid file content. Only standard JPG, PNG, and WebP images are permitted.",
  };
}

/**
 * Returns the base storage directory for uploaded assets.
 * Can be overridden via STORAGE_DIR environment variable.
 */
export function getStorageBaseDir(): string {
  if (process.env.STORAGE_DIR) {
    return path.resolve(process.env.STORAGE_DIR);
  }
  return path.resolve(process.cwd(), "storage", "uploads");
}

/**
 * Resolves the directory for a specific restaurant tenant.
 */
export function getRestaurantStorageDir(restaurantId: string): string {
  // Sanitize restaurantId to prevent traversal
  const sanitizedId = restaurantId.replace(/[^a-zA-Z0-9_-]/g, "");
  return path.join(getStorageBaseDir(), "restaurants", sanitizedId);
}

/**
 * Saves a validated image buffer to persistent tenant storage.
 * Returns the serving URL and metadata.
 */
export async function saveRestaurantImage(
  restaurantId: string,
  buffer: Buffer,
  extension: "jpg" | "png" | "webp"
): Promise<{ url: string; filename: string; size: number }> {
  const dir = getRestaurantStorageDir(restaurantId);
  await fs.mkdir(dir, { recursive: true });

  const uniqueId = crypto.randomUUID();
  const filename = `${uniqueId}.${extension}`;
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, buffer);

  const url = `/api/restaurants/${restaurantId}/images/${filename}`;

  return {
    url,
    filename,
    size: buffer.length,
  };
}

/**
 * Safely resolves an image path for serving, guarding against path traversal.
 */
export async function getRestaurantImageFilePath(
  restaurantId: string,
  filename: string
): Promise<{ filePath: string; mimeType: string } | null> {
  // Strict filename validation: only UUID-like / alphanumeric + safe extension
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp)$/i.test(filename)) {
    return null;
  }

  const tenantDir = path.resolve(getRestaurantStorageDir(restaurantId));
  const candidatePath = path.resolve(tenantDir, filename);

  // Strict path traversal check
  if (!candidatePath.startsWith(tenantDir)) {
    return null;
  }

  try {
    const stats = await fs.stat(candidatePath);
    if (!stats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  const ext = path.extname(filename).toLowerCase();
  let mimeType = "application/octet-stream";
  if (ext === ".jpg" || ext === ".jpeg") mimeType = "image/jpeg";
  else if (ext === ".png") mimeType = "image/png";
  else if (ext === ".webp") mimeType = "image/webp";

  return {
    filePath: candidatePath,
    mimeType,
  };
}
