import { z } from "zod"

/**
 * Server-side validation for account creation (invite signup, admin setup).
 * Credentials only — a display name is never collected at signup (spec
 * §5.12); users go by their email prefix until they set one in Settings.
 */
export const registerFieldsSchema = z.object({
  email: z.email(),
  password: z.string().min(8),
})

export const setupFieldsSchema = registerFieldsSchema

/** Account-creation form for the invite page. */
export const registerFormSchema = registerFieldsSchema
  .extend({
    confirmPassword: z.string().min(8),
  })
  .superRefine(({ password, confirmPassword }, ctx) => {
    if (password !== confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      })
    }
  })
