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
 * Detects whether persistent cloud object storage (AWS S3, Cloudflare R2, Supabase) is configured.
 */
export function isCloudStorageConfigured(): boolean {
  return Boolean(
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY_ID &&
    process.env.S3_SECRET_ACCESS_KEY
  );
}

/**
 * Returns configuration guidance if cloud storage is not yet set up for production.
 */
export function getStorageConfigurationStatus(): {
  provider: "s3" | "local";
  configured: boolean;
  missingEnv: string[];
} {
  const missing: string[] = [];
  if (!process.env.S3_BUCKET) missing.push("S3_BUCKET");
  if (!process.env.S3_ACCESS_KEY_ID) missing.push("S3_ACCESS_KEY_ID");
  if (!process.env.S3_SECRET_ACCESS_KEY) missing.push("S3_SECRET_ACCESS_KEY");

  return {
    provider: missing.length === 0 ? "s3" : "local",
    configured: missing.length === 0,
    missingEnv: missing,
  };
}

/**
 * Uploads an image buffer to S3-compatible cloud storage using SigV4 signing.
 */
async function uploadToS3(
  key: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const bucket = process.env.S3_BUCKET!;
  const region = process.env.S3_REGION || "auto";
  const rawEndpoint = process.env.S3_ENDPOINT || `https://${bucket}.s3.${region}.amazonaws.com`;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY!;

  const baseEndpoint = rawEndpoint.endsWith("/") ? rawEndpoint.slice(0, -1) : rawEndpoint;
  const targetUrl = new URL(`${baseEndpoint}/${bucket}/${key}`);

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash("sha256").update(buffer).digest("hex");

  const host = targetUrl.host;
  const canonicalUri = targetUrl.pathname;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = `PUT\n${canonicalUri}\n\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;

  const service = "s3";
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = `AWS4-HMAC-SHA256\n${amzDate}\n${credentialScope}\n${crypto.createHash("sha256").update(canonicalRequest).digest("hex")}`;

  const kDate = crypto.createHmac("sha256", `AWS4${secretAccessKey}`).update(dateStamp).digest();
  const kRegion = crypto.createHmac("sha256", kDate).update(region).digest();
  const kService = crypto.createHmac("sha256", kRegion).update(service).digest();
  const kSigning = crypto.createHmac("sha256", kService).update("aws4_request").digest();
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign).digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(targetUrl.toString(), {
    method: "PUT",
    headers: {
      Host: host,
      "Content-Type": mimeType,
      "x-amz-date": amzDate,
      "x-amz-content-sha256": payloadHash,
      Authorization: authHeader,
    },
    body: new Uint8Array(buffer),
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => "");
    throw new Error(`S3 upload failed (${res.status}): ${errorText}`);
  }

  const publicBase = process.env.S3_PUBLIC_URL || baseEndpoint;
  const cleanPublic = publicBase.endsWith("/") ? publicBase.slice(0, -1) : publicBase;
  return `${cleanPublic}/${bucket}/${key}`;
}

/**
 * Returns the base storage directory for uploaded assets.
 * Respects STORAGE_DIR and Vercel serverless /tmp isolation.
 */
export function getStorageBaseDir(): string {
  if (process.env.STORAGE_DIR) {
    return path.resolve(process.env.STORAGE_DIR);
  }
  if (process.env.VERCEL === "1") {
    return path.resolve("/tmp", "qrserve", "uploads");
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
 * Supports S3/R2 cloud storage when configured, with local/Vercel fallback.
 */
export async function saveRestaurantImage(
  restaurantId: string,
  buffer: Buffer,
  extension: "jpg" | "png" | "webp"
): Promise<{ url: string; filename: string; size: number }> {
  const uniqueId = crypto.randomUUID();
  const filename = `${uniqueId}.${extension}`;

  if (isCloudStorageConfigured()) {
    const mime = extension === "jpg" ? "image/jpeg" : extension === "png" ? "image/png" : "image/webp";
    const key = `restaurants/${restaurantId}/${filename}`;
    const cloudUrl = await uploadToS3(key, buffer, mime);
    return {
      url: cloudUrl,
      filename,
      size: buffer.length,
    };
  }

  const dir = getRestaurantStorageDir(restaurantId);
  await fs.mkdir(dir, { recursive: true });
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
