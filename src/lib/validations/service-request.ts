import { z } from "zod";
import { ServiceRequestType, ServiceRequestStatus } from "@prisma/client";

export const CreateServiceRequestSchema = z.object({
  qrToken: z
    .string()
    .trim()
    .min(1, "Table QR token is required to request service."),
  type: z.nativeEnum(ServiceRequestType, {
    message: "Invalid service request type.",
  }),
  message: z
    .string()
    .trim()
    .max(200, "Message cannot exceed 200 characters.")
    .optional()
    .nullable(),
});

export const UpdateServiceRequestStatusSchema = z.object({
  status: z.nativeEnum(ServiceRequestStatus, {
    message: "Invalid service request status.",
  }),
});

export type CreateServiceRequestInput = z.infer<typeof CreateServiceRequestSchema>;
export type UpdateServiceRequestStatusInput = z.infer<typeof UpdateServiceRequestStatusSchema>;
