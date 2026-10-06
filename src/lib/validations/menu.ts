import { z } from "zod";

export const CreateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(50, "Category name cannot exceed 50 characters."),
  description: z.string().trim().max(255, "Description cannot exceed 255 characters.").optional().nullable(),
  sortOrder: z.number().int("Sort order must be an integer.").min(0).max(9999).default(0),
  isActive: z.boolean().default(true),
});

export const UpdateCategorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Category name is required.")
    .max(50, "Category name cannot exceed 50 characters.")
    .optional(),
  description: z.string().trim().max(255, "Description cannot exceed 255 characters.").optional().nullable(),
  sortOrder: z.number().int("Sort order must be an integer.").min(0).max(9999).optional(),
  isActive: z.boolean().optional(),
});

const isValidImageUrlOrPath = (val: string | null | undefined): boolean => {
  if (!val || val === "") return true;
  if (val.startsWith("/")) return true;
  try {
    const url = new URL(val);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
};

export const MenuItemImageUrlSchema = z
  .string()
  .trim()
  .max(1000, "Image URL cannot exceed 1000 characters.")
  .refine(isValidImageUrlOrPath, {
    message: "Must be a valid image URL or relative path.",
  })
  .optional()
  .nullable()
  .or(z.literal(""));

export const CreateMenuItemSchema = z.object({
  categoryId: z.string().trim().min(1, "Category is required."),
  name: z
    .string()
    .trim()
    .min(1, "Item name is required.")
    .max(100, "Item name cannot exceed 100 characters."),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters.").optional().nullable(),
  price: z.coerce
    .number()
    .positive("Price must be greater than 0.")
    .max(999999.99, "Price exceeds maximum allowed.")
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: "Price cannot have more than 2 decimal places.",
    }),
  imageUrl: MenuItemImageUrlSchema,
  isAvailable: z.boolean().default(true),
  useCustomTaxRate: z.boolean().default(false),
  taxRate: z.coerce
    .number()
    .min(0, "GST rate cannot be negative.")
    .max(28, "GST rate cannot exceed 28%.")
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: "GST rate cannot have more than 2 decimal places.",
    })
    .optional()
    .nullable(),
});

export const UpdateMenuItemSchema = z.object({
  categoryId: z.string().trim().min(1, "Category is required.").optional(),
  name: z
    .string()
    .trim()
    .min(1, "Item name is required.")
    .max(100, "Item name cannot exceed 100 characters.")
    .optional(),
  description: z.string().trim().max(500, "Description cannot exceed 500 characters.").optional().nullable(),
  price: z.coerce
    .number()
    .positive("Price must be greater than 0.")
    .max(999999.99, "Price exceeds maximum allowed.")
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: "Price cannot have more than 2 decimal places.",
    })
    .optional(),
  imageUrl: MenuItemImageUrlSchema,
  isAvailable: z.boolean().optional(),
  useCustomTaxRate: z.boolean().optional(),
  taxRate: z.coerce
    .number()
    .min(0, "GST rate cannot be negative.")
    .max(28, "GST rate cannot exceed 28%.")
    .refine((val) => Number(val.toFixed(2)) === val, {
      message: "GST rate cannot have more than 2 decimal places.",
    })
    .optional()
    .nullable(),
});

export type CreateCategoryInput = z.infer<typeof CreateCategorySchema>;
export type UpdateCategoryInput = z.infer<typeof UpdateCategorySchema>;
export type CreateMenuItemInput = z.infer<typeof CreateMenuItemSchema>;
export type UpdateMenuItemInput = z.infer<typeof UpdateMenuItemSchema>;
