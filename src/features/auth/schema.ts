import { z } from "zod"

/** Server-side validation for account creation (invite signup, admin setup). */
export const registerFieldsSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
})

/**
 * First-run setup asks only for credentials — the admin's display name is
 * derived from the email until they set one.
 */
export const setupFieldsSchema = registerFieldsSchema.omit({ name: true })

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
