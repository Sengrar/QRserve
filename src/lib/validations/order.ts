import { z } from "zod";
import { OrderStatus } from "@prisma/client";

export const OrderItemInputSchema = z.object({
  menuItemId: z.string().trim().min(1, "Menu item ID is required."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(50, "Quantity cannot exceed 50 per item."),
  notes: z
    .string()
    .trim()
    .max(200, "Item instructions cannot exceed 200 characters.")
    .optional()
    .nullable(),
});

export const CreateOrderSchema = z.object({
  qrToken: z
    .string()
    .trim()
    .max(100, "Invalid table token format.")
    .optional()
    .nullable(),
  tableId: z
    .string()
    .trim()
    .max(100, "Invalid table ID format.")
    .optional()
    .nullable(),
  tableNumber: z
    .string()
    .trim()
    .max(50, "Table number cannot exceed 50 characters.")
    .optional()
    .nullable(),
  customerNotes: z
    .string()
    .trim()
    .max(500, "Customer instructions cannot exceed 500 characters.")
    .optional()
    .nullable(),
  couponCode: z
    .string()
    .trim()
    .max(20, "Coupon code cannot exceed 20 characters.")
    .optional()
    .nullable(),
  customerPhone: z
    .string()
    .trim()
    .max(20, "Phone number cannot exceed 20 characters.")
    .optional()
    .nullable(),
  customerName: z
    .string()
    .trim()
    .max(100, "Customer name cannot exceed 100 characters.")
    .optional()
    .nullable(),
  idempotencyKey: z
    .string()
    .trim()
    .min(8, "Idempotency key must be at least 8 characters.")
    .max(128, "Idempotency key too long.")
    .optional()
    .nullable(),
  items: z
    .array(OrderItemInputSchema)
    .min(1, "Order must contain at least one item.")
    .max(100, "Order cannot contain more than 100 items."),
});

export const UpdateOrderStatusSchema = z.object({
  status: z.nativeEnum(OrderStatus, {
    error: "Invalid order status value.",
  }),
});

export type OrderItemInput = z.infer<typeof OrderItemInputSchema>;
export type CreateOrderInput = z.infer<typeof CreateOrderSchema>;
export type UpdateOrderStatusInput = z.infer<typeof UpdateOrderStatusSchema>;
