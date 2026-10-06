import { describe, it, expect } from "vitest";
import {
  validateImageBuffer,
  MAX_FILE_SIZE_BYTES,
  getRestaurantImageFilePath,
} from "@/lib/storage";

describe("Food Image Upload & Storage Validation", () => {
  it("accepts valid JPEG buffer based on magic bytes", () => {
    // JPEG header: FF D8 FF
    const jpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
    const res = validateImageBuffer(jpegBuffer, "image/jpeg");

    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.mimeType).toBe("image/jpeg");
      expect(res.extension).toBe("jpg");
    }
  });

  it("accepts valid PNG buffer based on magic bytes", () => {
    // PNG header: 89 50 4E 47 0D 0A 1A 0A
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const res = validateImageBuffer(pngBuffer, "image/png");

    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.mimeType).toBe("image/png");
      expect(res.extension).toBe("png");
    }
  });

  it("accepts valid WebP buffer based on RIFF/WEBP magic bytes", () => {
    // RIFF (4 bytes) + 4 dummy bytes + WEBP (4 bytes)
    const webpBuffer = Buffer.from([
      0x52, 0x49, 0x46, 0x46, // RIFF
      0x00, 0x00, 0x00, 0x00, // length
      0x57, 0x45, 0x42, 0x50, // WEBP
    ]);
    const res = validateImageBuffer(webpBuffer, "image/webp");

    expect(res.valid).toBe(true);
    if (res.valid) {
      expect(res.mimeType).toBe("image/webp");
      expect(res.extension).toBe("webp");
    }
  });

  it("rejects empty buffer", () => {
    const emptyBuffer = Buffer.alloc(0);
    const res = validateImageBuffer(emptyBuffer);

    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toMatch(/empty/i);
    }
  });

  it("rejects files exceeding maximum allowed size (5MB)", () => {
    const oversizedBuffer = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1);
    // Even if header starts with JPEG magic bytes
    oversizedBuffer[0] = 0xff;
    oversizedBuffer[1] = 0xd8;
    oversizedBuffer[2] = 0xff;

    const res = validateImageBuffer(oversizedBuffer);

    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toMatch(/5MB/i);
    }
  });

  it("rejects non-image files disguised with an image extension", () => {
    // Plain text / script content disguised
    const textBuffer = Buffer.from("<?php echo 'malicious'; ?>");
    const res = validateImageBuffer(textBuffer, "image/jpeg");

    expect(res.valid).toBe(false);
    if (!res.valid) {
      expect(res.error).toMatch(/invalid file content/i);
    }
  });

  describe("Path Traversal Protection", () => {
    it("rejects filenames containing directory traversal characters", async () => {
      const traversalAttempts = [
        "../secret.png",
        "..\\secret.png",
        "nested/path.jpg",
        "safe.png;rm -rf /",
        "file.exe",
      ];

      for (const attempt of traversalAttempts) {
        const result = await getRestaurantImageFilePath("rest_123", attempt);
        expect(result).toBeNull();
      }
    });
  });
});
