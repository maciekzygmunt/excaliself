import { z } from "zod"
import { m } from "@/paraglide/messages"

/**
 * Server-side validation for account creation (invite signup, admin setup).
 * Credentials only — a display name is never collected at signup (spec
 * §5.12); users go by their email prefix until they set one in Settings.
 */
export const registerFieldsSchema = z.object({
  email: z.email({ error: () => m.auth_email_invalid() }),
  password: z.string().min(8, { error: () => m.auth_password_too_short() }),
})

export const setupFieldsSchema = registerFieldsSchema

const confirmPasswordMatches = (
  { password, confirmPassword }: { password: string; confirmPassword: string },
  ctx: z.RefinementCtx,
) => {
  if (password !== confirmPassword) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["confirmPassword"],
      message: m.auth_passwords_mismatch(),
    })
  }
}

/** Account-creation form for the invite page. */
export const registerFormSchema = registerFieldsSchema
  .extend({
    confirmPassword: z
      .string()
      .min(8, { error: () => m.auth_password_too_short() }),
  })
  .superRefine(confirmPasswordMatches)

/** Sign-in form. No password minimum: existing passwords are as they are. */
export const signInFormSchema = z.object({
  email: z.email({ error: () => m.auth_email_invalid() }),
  password: z.string(),
})

/** Set-new-password form for the password-reset page. */
export const newPasswordFormSchema = z
  .object({
    password: z.string().min(8, { error: () => m.auth_password_too_short() }),
    confirmPassword: z
      .string()
      .min(8, { error: () => m.auth_password_too_short() }),
  })
  .superRefine(confirmPasswordMatches)
