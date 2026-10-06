import { describe, it, expect, vi } from "vitest";
import { UserRole } from "@prisma/client";
import { POST as uploadHandler } from "@/app/api/restaurants/[id]/upload/route";
import { GET as imageServeHandler } from "@/app/api/restaurants/[id]/images/[filename]/route";
import { saveRestaurantImage } from "@/lib/storage";

// Mock authentication & tenant security
vi.mock("@/lib/security/tenant", () => ({
  requireAuth: vi.fn(),
  verifyRestaurantAccess: vi.fn(),
}));

import { requireAuth, verifyRestaurantAccess } from "@/lib/security/tenant";

describe("Upload API & Image Serving", () => {
  it("rejects unauthenticated upload requests with 401", async () => {
    const authError = new Error("Authentication required.");
    authError.name = "AuthenticationError";
    vi.mocked(requireAuth).mockRejectedValueOnce(authError);

    const formData = new FormData();
    const req = new Request("http://localhost:3000/api/restaurants/rest_123/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req, {
      params: Promise.resolve({ id: "rest_123" }),
    });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects unauthorized cross-tenant upload requests with 403", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({
      id: "user_other",
      role: UserRole.RESTAURANT_OWNER,
      email: "user@example.com",
      name: "Other User",
    });

    vi.mocked(verifyRestaurantAccess).mockResolvedValueOnce({
      authorized: false,
      isSuperAdmin: false,
    });

    const formData = new FormData();
    const req = new Request("http://localhost:3000/api/restaurants/rest_123/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req, {
      params: Promise.resolve({ id: "rest_123" }),
    });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.success).toBe(false);
  });

  it("rejects upload requests missing file with 400", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({
      id: "owner_123",
      role: UserRole.RESTAURANT_OWNER,
      email: "owner@example.com",
      name: "Restaurant Owner",
    });

    vi.mocked(verifyRestaurantAccess).mockResolvedValueOnce({
      authorized: true,
      isSuperAdmin: false,
    });

    const formData = new FormData();
    const req = new Request("http://localhost:3000/api/restaurants/rest_123/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req, {
      params: Promise.resolve({ id: "rest_123" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/no image file/i);
  });

  it("rejects files with invalid magic bytes (fake jpg) with 400", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({
      id: "owner_123",
      role: UserRole.RESTAURANT_OWNER,
      email: "owner@example.com",
      name: "Restaurant Owner",
    });

    vi.mocked(verifyRestaurantAccess).mockResolvedValueOnce({
      authorized: true,
      isSuperAdmin: false,
    });

    const fakeFile = new File(["malicious text script content"], "food.jpg", {
      type: "image/jpeg",
    });

    const formData = new FormData();
    formData.append("file", fakeFile);

    const req = new Request("http://localhost:3000/api/restaurants/rest_123/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req, {
      params: Promise.resolve({ id: "rest_123" }),
    });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/only standard jpg, png, and webp/i);
  });

  it("successfully processes and saves a valid image file", async () => {
    vi.mocked(requireAuth).mockResolvedValueOnce({
      id: "owner_123",
      role: UserRole.RESTAURANT_OWNER,
      email: "owner@example.com",
      name: "Restaurant Owner",
    });

    vi.mocked(verifyRestaurantAccess).mockResolvedValueOnce({
      authorized: true,
      isSuperAdmin: false,
    });

    // Valid PNG magic bytes
    const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    const validFile = new File([pngBytes], "dish.png", { type: "image/png" });

    const formData = new FormData();
    formData.append("file", validFile);

    const req = new Request("http://localhost:3000/api/restaurants/rest_test/upload", {
      method: "POST",
      body: formData,
    });

    const res = await uploadHandler(req, {
      params: Promise.resolve({ id: "rest_test" }),
    });

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.url).toMatch(/^\/api\/restaurants\/rest_test\/images\/[a-f0-9-]+\.png$/);
    expect(json.data.filename).toMatch(/^[a-f0-9-]+\.png$/);
  });

  it("serves the saved image with proper Content-Type and security headers", async () => {
    // Save a test PNG image directly
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const saved = await saveRestaurantImage("rest_serve_test", pngBuffer, "png");

    const req = new Request(`http://localhost:3000${saved.url}`);
    const res = await imageServeHandler(req, {
      params: Promise.resolve({ id: "rest_serve_test", filename: saved.filename }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("rejects path traversal attempts on image serving endpoint with 404", async () => {
    const req = new Request("http://localhost:3000/api/restaurants/rest_123/images/..%2fsecret.png");
    const res = await imageServeHandler(req, {
      params: Promise.resolve({ id: "rest_123", filename: "../secret.png" }),
    });

    expect(res.status).toBe(404);
  });
});
