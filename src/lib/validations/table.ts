import { z } from "zod";
import { TableStatus } from "@prisma/client";

export const CreateTableSchema = z.object({
  tableNumber: z
    .string()
    .trim()
    .min(1, "Table number/identifier is required.")
    .max(50, "Table number cannot exceed 50 characters."),
  name: z
    .string()
    .trim()
    .max(100, "Table label/name cannot exceed 100 characters.")
    .optional()
    .nullable(),
  status: z.nativeEnum(TableStatus).default(TableStatus.AVAILABLE),
  isActive: z.boolean().default(true),
});

export const UpdateTableSchema = z.object({
  tableNumber: z
    .string()
    .trim()
    .min(1, "Table number/identifier is required.")
    .max(50, "Table number cannot exceed 50 characters.")
    .optional(),
  name: z
    .string()
    .trim()
    .max(100, "Table label/name cannot exceed 100 characters.")
    .optional()
    .nullable(),
  status: z.nativeEnum(TableStatus).optional(),
  isActive: z.boolean().optional(),
});

export type CreateTableInput = z.infer<typeof CreateTableSchema>;
export type UpdateTableInput = z.infer<typeof UpdateTableSchema>;
