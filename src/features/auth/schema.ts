import { z } from "zod"

/** Server-side validation for account creation (invite signup, admin setup). */
export const registerFieldsSchema = z.object({
  name: z.string().min(1),
  email: z.email(),
  password: z.string().min(8),
})

/** Account-creation form shared by the invite and first-run setup pages. */
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
