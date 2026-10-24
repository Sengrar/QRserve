import { z } from "zod";
import { ApprovalStatus, TaxCalculationMode } from "@prisma/client";
import { GSTIN_REGEX } from "@/lib/orders/tax";

export const CreateRestaurantSchema = z.object({
  name: z
    .string()
    .min(2, { message: "Restaurant name must be at least 2 characters" })
    .max(100, { message: "Restaurant name cannot exceed 100 characters" })
    .trim(),
  slug: z
    .string()
    .min(3, { message: "Slug must be at least 3 characters" })
    .max(50, { message: "Slug cannot exceed 50 characters" })
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
      message: "Slug must contain only lowercase alphanumeric characters and single hyphens",
    })
    .trim(),
  description: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(100).optional().nullable(),
  address: z.string().max(255).optional().nullable(),
  googleReviewUrl: z
    .string()
    .url({ message: "Must be a valid URL" })
    .regex(/^https?:\/\//i, { message: "URL must start with http:// or https://" })
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  agreedToTerms: z
    .boolean({ message: "You must accept the Terms & Conditions to register a restaurant." })
    .refine((val) => val === true, {
      message: "You must accept the Terms & Conditions to register a restaurant.",
    }),
});

export const UpdateRestaurantSettingsSchema = z.object({
  name: z
    .string()
    .min(2, { message: "Restaurant name must be at least 2 characters" })
    .max(100, { message: "Restaurant name cannot exceed 100 characters" })
    .trim()
    .optional(),
  description: z.string().max(500).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email().max(100).optional().nullable().or(z.literal("")),
  address: z.string().max(255).optional().nullable(),
  googleReviewUrl: z
    .string()
    .url({ message: "Must be a valid URL" })
    .regex(/^https?:\/\//i, { message: "URL must start with http:// or https://" })
    .max(500)
    .optional()
    .nullable()
    .or(z.literal("")),
  isActive: z.boolean().optional(),
  // GST and Tax Settings
  gstEnabled: z.boolean().optional(),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((val) => val === "" || GSTIN_REGEX.test(val), {
      message: "Invalid GSTIN format. Must be a 15-character valid Indian GSTIN (e.g., 29ABCDE1234F1Z5)",
    })
    .transform((val) => (val === "" ? null : val))
    .optional()
    .nullable(),
  legalName: z
    .string()
    .trim()
    .max(150, { message: "Legal business name cannot exceed 150 characters" })
    .optional()
    .nullable(),
  taxRate: z
    .number({ error: "Tax rate must be a number" })
    .min(0, { message: "Tax rate cannot be negative" })
    .max(28, { message: "Tax rate cannot exceed 28%" })
    .optional(),
  taxMode: z.nativeEnum(TaxCalculationMode, {
    error: "Invalid tax mode. Choose EXCLUSIVE or INCLUSIVE",
  }).optional(),
});

export const UpdateRestaurantStatusByAdminSchema = z.object({
  approvalStatus: z.nativeEnum(ApprovalStatus).optional(),
  rejectionReason: z.string().max(500).optional().nullable(),
  isSuspended: z.boolean().optional(),
  tableLimit: z.coerce
    .number()
    .int("Allowed tables must be a whole number")
    .min(1, "Allowed tables must be at least 1")
    .max(10000, "Allowed tables cannot exceed 10000")
    .optional(),
});

export const ToggleRestaurantActiveSchema = z.object({
  isActive: z.boolean(),
});

export type CreateRestaurantInput = z.infer<typeof CreateRestaurantSchema>;
export type UpdateRestaurantSettingsInput = z.infer<typeof UpdateRestaurantSettingsSchema>;
export type UpdateRestaurantStatusByAdminInput = z.infer<typeof UpdateRestaurantStatusByAdminSchema>;
export type ToggleRestaurantActiveInput = z.infer<typeof ToggleRestaurantActiveSchema>;
