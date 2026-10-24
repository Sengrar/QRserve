import { z } from "zod";

export const RegisterSchema = z.object({
  name: z
    .string()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(80, { message: "Name must be less than 80 characters" })
    .trim(),
  email: z
    .string()
    .email({ message: "Please provide a valid email address" })
    .max(120, { message: "Email must be less than 120 characters" })
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .max(100, { message: "Password must be less than 100 characters" })
    .regex(/[A-Za-z]/, { message: "Password must contain at least one letter" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" }),
  agreedToTerms: z
    .boolean({ message: "You must agree to the Terms & Conditions" })
    .refine((val) => val === true, {
      message: "You must agree to the Terms & Conditions",
    }),
});

export const LoginSchema = z.object({
  email: z
    .string()
    .email({ message: "Please provide a valid email address" })
    .toLowerCase()
    .trim(),
  password: z
    .string()
    .min(1, { message: "Password is required" }),
});

export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .email({ message: "Please provide a valid email address" })
    .toLowerCase()
    .trim(),
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, { message: "Reset token is required" }),
  password: z
    .string()
    .min(8, { message: "Password must be at least 8 characters long" })
    .max(100, { message: "Password must be less than 100 characters" })
    .regex(/[A-Za-z]/, { message: "Password must contain at least one letter" })
    .regex(/[0-9]/, { message: "Password must contain at least one number" }),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
