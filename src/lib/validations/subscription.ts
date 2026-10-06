import { z } from "zod";
import {
  SubscriptionPlan,
  SubscriptionStatus,
  BillingPeriod,
  SubscriptionPaymentStatus,
  PaymentMethod,
  PaymentRequestStatus,
} from "@prisma/client";

export const CreatePaymentRequestSchema = z
  .object({
    plan: z
      .nativeEnum(SubscriptionPlan, {
        message: "Please select a valid plan (SMALL, MEDIUM, LARGE).",
      })
      .optional()
      .default(SubscriptionPlan.SMALL),
    billingPeriod: z
      .nativeEnum(BillingPeriod, {
        message: "Billing period must be MONTHLY or YEARLY.",
      })
      .optional()
      .default(BillingPeriod.MONTHLY),
    tableCount: z
      .number()
      .int("Table count must be an integer.")
      .min(1, "Table count must be at least 1.")
      .max(1000, "Table count exceeds maximum allowed.")
      .optional(),
    paymentMethod: z.nativeEnum(PaymentMethod, {
      message: "Payment method must be UPI or BANK_TRANSFER.",
    }),
    utrReference: z
      .string()
      .trim()
      .min(6, "Payment reference/UTR must be at least 6 characters.")
      .max(64, "Payment reference/UTR cannot exceed 64 characters.")
      .regex(/^[a-zA-Z0-9_-]+$/, "Reference/UTR should contain letters, numbers, and dashes only."),
    proofUrl: z.string().trim().max(500000).optional().nullable(),
    notes: z.string().trim().max(500, "Notes cannot exceed 500 characters.").optional().nullable(),
    // Client amounts are ignored by server calculation, but allowed in payload
    amount: z.any().optional(),
  })
  .refine(
    (data) => {
      if (data.plan === SubscriptionPlan.LARGE) {
        return typeof data.tableCount === "number" && data.tableCount >= 1;
      }
      return true;
    },
    {
      message: "You must specify the desired number of tables for the Large plan.",
      path: ["tableCount"],
    }
  );

export const ReviewPaymentRequestSchema = z.object({
  status: z.enum([PaymentRequestStatus.APPROVED, PaymentRequestStatus.REJECTED], {
    message: "Status must be APPROVED or REJECTED.",
  }),
  adminNotes: z.string().trim().max(500, "Review notes cannot exceed 500 characters.").optional().nullable(),
});

export const UpdatePaymentConfigSchema = z.object({
  upiId: z.string().trim().min(3).max(100),
  payeeName: z.string().trim().min(2).max(100),
  bankName: z.string().trim().min(2).max(100),
  accountNumber: z.string().trim().min(6).max(50),
  ifscCode: z.string().trim().min(4).max(20),
  accountType: z.string().trim().min(2).max(50),
  instructions: z.string().trim().max(1000).optional().nullable(),
});

export const AdminManageSubscriptionSchema = z.object({
  action: z.enum(["EXTEND", "SUSPEND", "ACTIVATE"], {
    message: "Action must be EXTEND, SUSPEND, or ACTIVATE.",
  }),
  days: z.number().int().min(1).max(365).optional(),
  reason: z.string().trim().min(3, "A reason must be provided (at least 3 characters).").max(500),
});

export const AdminUpdateCustomPricingSchema = z.object({
  monthlyPrice: z.coerce
    .number()
    .min(0, "Monthly price cannot be negative.")
    .max(10000000, "Monthly price exceeds maximum allowed."),
  yearlyPrice: z.coerce
    .number()
    .min(0, "Yearly price cannot be negative.")
    .max(10000000, "Yearly price exceeds maximum allowed."),
  billingPeriod: z.nativeEnum(BillingPeriod, {
    message: "Billing period must be MONTHLY or YEARLY.",
  }),
  nextBillingDate: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || !isNaN(Date.parse(val)), {
      message: "Please enter a valid next billing date.",
    }),
  paymentStatus: z.nativeEnum(SubscriptionPaymentStatus, {
    message: "Payment status must be PENDING, PAID, or OVERDUE.",
  }),
  subscriptionStatus: z.nativeEnum(SubscriptionStatus, {
    message: "Subscription status must be ACTIVE, SUSPENDED, EXPIRED, or CANCELLED.",
  }),
  currency: z.string().trim().min(1).max(10).default("INR").optional(),
  tableLimit: z.coerce.number().int().min(1).max(10000).optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

