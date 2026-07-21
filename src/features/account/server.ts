"use server"

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { APIError } from "better-auth/api"
import { and, eq, ne } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"

// Read the row fresh rather than trusting the session's cookie cache — a
// just-saved profile edit must never be masked by a stale cookie snapshot.
export const getCurrentUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, context.session.user.id))
    if (!user) throw new Error("User not found")
    return user
  })

// Display name is optional (spec §5.12): an empty submission clears it back
// to null so the email-prefix fallback takes over everywhere.
export type ChangeEmailResult =
  | { ok: true }
  | { ok: false; error: "invalid-password" | "email-taken" }

/**
 * Change the sign-in email after re-authenticating with the current
 * password. The instance has no SMTP, so there is no verification loop —
 * the email is a login identifier and the change takes effect immediately.
 * Expected failures come back as a typed result so the form can pin them
 * to the right field; anything else stays an exception.
 */
export const changeEmail = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      newEmail: z.email().trim().toLowerCase().max(255),
      currentPassword: z.string().min(1),
    }),
  )
  .handler(async ({ data, context }): Promise<ChangeEmailResult> => {
    try {
      // Bypasses the session cookie cache and compares against the stored
      // credential hash; throws BAD_REQUEST on a mismatch.
      await auth.api.verifyPassword({
        body: { password: data.currentPassword },
        headers: getRequestHeaders(),
      })
    } catch (error) {
      if (error instanceof APIError && error.statusCode === 400) {
        return { ok: false, error: "invalid-password" }
      }
      throw error
    }

    const userId = context.session.user.id
    const [taken] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, data.newEmail), ne(users.id, userId)))
    if (taken) return { ok: false, error: "email-taken" }

    await db
      .update(users)
      .set({ email: data.newEmail, updatedAt: new Date() })
      .where(eq(users.id, userId))
    return { ok: true }
  })

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ name: z.string().trim().max(120) }))
  .handler(async ({ data, context }) => {
    await db
      .update(users)
      .set({ name: data.name === "" ? null : data.name, updatedAt: new Date() })
      .where(eq(users.id, context.session.user.id))
  })
