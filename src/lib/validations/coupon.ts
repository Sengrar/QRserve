import { z } from "zod";
import { CouponDiscountType } from "@prisma/client";

// Normalize coupon codes: alphanumeric, uppercase, no spaces, hyphens/underscores allowed
export const CouponCodeSchema = z
  .string()
  .trim()
  .min(2, "Coupon code must be at least 2 characters.")
  .max(20, "Coupon code cannot exceed 20 characters.")
  .regex(
    /^[A-Z0-9_-]+$/i,
    "Coupon code can only contain letters, numbers, hyphens, and underscores."
  )
  .transform((val) => val.toUpperCase());

const FlexibleDateField = (fieldLabel: string) =>
  z
    .string()
    .trim()
    .nullish()
    .refine(
      (val) => {
        if (val === undefined || val === null || val === "") return true;
        const parsed = Date.parse(val);
        if (isNaN(parsed)) return false;
        const year = new Date(parsed).getUTCFullYear();
        return year >= 2020 && year <= 2099;
      },
      { message: `Invalid ${fieldLabel} format (year must be a 4-digit year between 2020 and 2099).` }
    )
    .transform((val) => {
      if (val === undefined) return undefined;
      if (val === null || !val.trim()) return null;
      return new Date(val).toISOString();
    });

export const CreateCouponSchema = z
  .object({
    code: CouponCodeSchema,
    description: z
      .string()
      .trim()
      .max(250, "Description cannot exceed 250 characters.")
      .optional()
      .nullable(),
    discountType: z.nativeEnum(CouponDiscountType, {
      error: "Discount type must be PERCENTAGE or FIXED.",
    }),
    discountValue: z
      .number()
      .positive("Discount value must be greater than zero.")
      .max(100000, "Discount value is too large."),
    minOrderSubtotal: z
      .number()
      .min(0, "Minimum order subtotal cannot be negative.")
      .default(0),
    maxDiscount: z
      .number()
      .positive("Maximum discount must be greater than zero.")
      .optional()
      .nullable(),
    startDate: FlexibleDateField("start date"),
    endDate: FlexibleDateField("end date"),
    usageLimit: z
      .number()
      .int("Usage limit must be a whole number.")
      .positive("Usage limit must be at least 1.")
      .optional()
      .nullable(),
    perCustomerLimit: z
      .number()
      .int("Per-customer limit must be a whole number.")
      .positive("Per-customer limit must be at least 1.")
      .optional()
      .nullable(),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.discountType === CouponDiscountType.PERCENTAGE) {
        return data.discountValue > 0 && data.discountValue <= 100;
      }
      return true;
    },
    {
      message: "Percentage discount must be between 1% and 100%.",
      path: ["discountValue"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Expiry date cannot be earlier than start date.",
      path: ["endDate"],
    }
  );

export const UpdateCouponSchema = z
  .object({
    description: z
      .string()
      .trim()
      .max(250, "Description cannot exceed 250 characters.")
      .optional()
      .nullable(),
    discountType: z.nativeEnum(CouponDiscountType).optional(),
    discountValue: z
      .number()
      .positive("Discount value must be greater than zero.")
      .max(100000, "Discount value is too large.")
      .optional(),
    minOrderSubtotal: z
      .number()
      .min(0, "Minimum order subtotal cannot be negative.")
      .optional(),
    maxDiscount: z
      .number()
      .positive("Maximum discount must be greater than zero.")
      .optional()
      .nullable(),
    startDate: FlexibleDateField("start date"),
    endDate: FlexibleDateField("end date"),
    usageLimit: z
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
    perCustomerLimit: z
      .number()
      .int()
      .positive()
      .optional()
      .nullable(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (
        data.discountType === CouponDiscountType.PERCENTAGE &&
        data.discountValue !== undefined
      ) {
        return data.discountValue > 0 && data.discountValue <= 100;
      }
      return true;
    },
    {
      message: "Percentage discount must be between 1% and 100%.",
      path: ["discountValue"],
    }
  )
  .refine(
    (data) => {
      if (data.startDate && data.endDate) {
        return new Date(data.startDate) <= new Date(data.endDate);
      }
      return true;
    },
    {
      message: "Expiry date cannot be earlier than start date.",
      path: ["endDate"],
    }
  );

export const ValidateCustomerCouponSchema = z.object({
  code: CouponCodeSchema,
  subtotal: z.number().min(0, "Subtotal must be positive."),
  customerPhone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{8,15}$/, "Please enter a valid phone number.")
    .optional()
    .nullable(),
});

export type CreateCouponInput = z.infer<typeof CreateCouponSchema>;
export type UpdateCouponInput = z.infer<typeof UpdateCouponSchema>;
export type ValidateCustomerCouponInput = z.infer<typeof ValidateCustomerCouponSchema>;
