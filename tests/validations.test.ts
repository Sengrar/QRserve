import { describe, it, expect } from "vitest";
import { RegisterSchema, LoginSchema } from "@/lib/validations/auth";
import {
  CreateRestaurantSchema,
  UpdateRestaurantStatusByAdminSchema,
  ToggleRestaurantActiveSchema,
} from "@/lib/validations/restaurant";
import { ApprovalStatus } from "@prisma/client";

describe("Input Validation Tests", () => {
  describe("RegisterSchema", () => {
    it("accepts valid registration payload", () => {
      const result = RegisterSchema.safeParse({
        name: "Luigi Mario",
        email: "luigi@trattoria.com",
        password: "SecurePassword123!",
      });
      expect(result.success).toBe(true);
    });

    it("rejects weak password with fewer than 8 characters", () => {
      const result = RegisterSchema.safeParse({
        name: "Luigi Mario",
        email: "luigi@trattoria.com",
        password: "pass1",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.password).toBeDefined();
      }
    });

    it("rejects password missing digits", () => {
      const result = RegisterSchema.safeParse({
        name: "Luigi Mario",
        email: "luigi@trattoria.com",
        password: "OnlyLettersPassword",
      });
      expect(result.success).toBe(false);
    });

    it("rejects invalid email formats", () => {
      const result = RegisterSchema.safeParse({
        name: "Luigi Mario",
        email: "not-an-email",
        password: "SecurePassword123!",
      });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.flatten().fieldErrors.email).toBeDefined();
      }
    });

    it("strips malicious injected fields such as role or approvalStatus", () => {
      const result = RegisterSchema.safeParse({
        name: "Luigi Mario",
        email: "luigi@trattoria.com",
        password: "SecurePassword123!",
        role: "SUPER_ADMIN",
        approvalStatus: "APPROVED",
        isActive: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        // Zod output must only contain validated fields
        expect((result.data as Record<string, unknown>).role).toBeUndefined();
        expect((result.data as Record<string, unknown>).approvalStatus).toBeUndefined();
        expect((result.data as Record<string, unknown>).isActive).toBeUndefined();
      }
    });
  });

  describe("LoginSchema", () => {
    it("accepts valid login credentials", () => {
      const result = LoginSchema.safeParse({
        email: "owner@bistro.com",
        password: "SecretPassword1",
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing password", () => {
      const result = LoginSchema.safeParse({
        email: "owner@bistro.com",
        password: "",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("CreateRestaurantSchema", () => {
    it("accepts valid restaurant registration", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "Trattoria Da Luigi",
        slug: "trattoria-da-luigi",
        description: "Fresh pasta and woodfired pizza",
        phone: "+1 555-1234",
        email: "contact@daluigi.com",
        address: "42 Rome Way",
        googleReviewUrl: "https://g.page/r/sample-review",
      });
      expect(result.success).toBe(true);
    });

    it("rejects invalid slug with uppercase letters or special symbols", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "Trattoria Da Luigi",
        slug: "Trattoria_Da_Luigi!",
      });
      expect(result.success).toBe(false);
    });

    it("rejects empty restaurant name", () => {
      const result = CreateRestaurantSchema.safeParse({
        name: "",
        slug: "valid-slug",
      });
      expect(result.success).toBe(false);
    });
  });

  describe("UpdateRestaurantStatusByAdminSchema", () => {
    it("accepts valid admin approval status", () => {
      const result = UpdateRestaurantStatusByAdminSchema.safeParse({
        approvalStatus: ApprovalStatus.APPROVED,
        isSuspended: false,
      });
      expect(result.success).toBe(true);
    });

    it("accepts admin rejection with reason", () => {
      const result = UpdateRestaurantStatusByAdminSchema.safeParse({
        approvalStatus: ApprovalStatus.REJECTED,
        rejectionReason: "Incomplete address verification",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("ToggleRestaurantActiveSchema", () => {
    it("validates boolean isActive toggle", () => {
      expect(ToggleRestaurantActiveSchema.safeParse({ isActive: true }).success).toBe(true);
      expect(ToggleRestaurantActiveSchema.safeParse({ isActive: false }).success).toBe(true);
      expect(ToggleRestaurantActiveSchema.safeParse({ isActive: "yes" }).success).toBe(false);
    });
  });
});
