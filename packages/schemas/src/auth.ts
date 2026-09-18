import { z } from "zod";

/**
 * Client-side (web/mobile form) validation only. The API re-validates
 * everything server-side with class-validator DTOs — these schemas exist so
 * forms can give instant feedback without duplicating typo-prone regexes in
 * three places (§85: frontend validation is additional UX only).
 */

export const emailSchema = z.string().trim().toLowerCase().email();

// Min 8 chars, at least one letter and one digit. Deliberately not
// over-engineered (no forced symbols) — Argon2id server-side hashing is the
// real defense, this is just a basic UX guard against "1234567".
export const passwordSchema = z
  .string()
  .min(8, "auth.password.tooShort")
  .max(128, "auth.password.tooLong")
  .regex(/[a-zA-Z]/, "auth.password.needsLetter")
  .regex(/[0-9]/, "auth.password.needsDigit");

export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(100).optional(),
    nickname: z.string().trim().min(2).max(30).optional(),
    locale: z.enum(["uk", "en"]).default("uk"),
  })
  .refine((data) => Boolean(data.name || data.nickname), {
    message: "auth.register.nameOrNicknameRequired",
    path: ["name"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "auth.password.required"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
