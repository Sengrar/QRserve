import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPasswordResetToken, verifyPasswordResetToken } from "@/lib/auth/reset";
import { ForgotPasswordSchema, ResetPasswordSchema } from "@/lib/validations/auth";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
}));

describe("Password Reset Token & Validation Tests", () => {
  const mockUser = {
    id: "user_reset_123",
    email: "owner@testrestaurant.com",
    passwordHash: "$2a$12$e8iVw6wWbW6n2z1M3q9ZxeABCD1234567890",
    isActive: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Token Generation & Verification", () => {
    it("generates a valid reset token and verifies correctly against active user", async () => {
      const token = await createPasswordResetToken(mockUser);
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(20);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce(
        mockUser as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>
      );

      const verified = await verifyPasswordResetToken(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe(mockUser.id);
      expect(verified?.email).toBe(mockUser.email);
    });

    it("single-use protection: rejects token if user password hash has changed", async () => {
      const token = await createPasswordResetToken(mockUser);

      // User password hash changed after reset
      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...mockUser,
        passwordHash: "$2a$12$differentNewPasswordHash1234567899999",
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const verified = await verifyPasswordResetToken(token);
      expect(verified).toBeNull();
    });

    it("rejects token if user is deactivated", async () => {
      const token = await createPasswordResetToken(mockUser);

      vi.mocked(prisma.user.findUnique).mockResolvedValueOnce({
        ...mockUser,
        isActive: false,
      } as unknown as Awaited<ReturnType<typeof prisma.user.findUnique>>);

      const verified = await verifyPasswordResetToken(token);
      expect(verified).toBeNull();
    });

    it("rejects invalid, malformed, or tampered token", async () => {
      const verified = await verifyPasswordResetToken("invalid.tampered.token");
      expect(verified).toBeNull();
    });
  });

  describe("Validation Schemas", () => {
    it("validates correct email for forgot password", () => {
      const valid = ForgotPasswordSchema.safeParse({ email: "user@example.com" });
      expect(valid.success).toBe(true);

      const invalid = ForgotPasswordSchema.safeParse({ email: "not-an-email" });
      expect(invalid.success).toBe(false);
    });

    it("validates password strength on reset password", () => {
      const valid = ResetPasswordSchema.safeParse({
        token: "valid_token_string",
        password: "NewPassword2026!",
      });
      expect(valid.success).toBe(true);

      // Too short (< 8 chars)
      const tooShort = ResetPasswordSchema.safeParse({
        token: "valid_token_string",
        password: "pass1",
      });
      expect(tooShort.success).toBe(false);

      // Only letters (no number)
      const noNumber = ResetPasswordSchema.safeParse({
        token: "valid_token_string",
        password: "passwordwithoutnumbers",
      });
      expect(noNumber.success).toBe(false);

      // Only numbers (no letter)
      const noLetter = ResetPasswordSchema.safeParse({
        token: "valid_token_string",
        password: "1234567890",
      });
      expect(noLetter.success).toBe(false);
    });
  });
});
