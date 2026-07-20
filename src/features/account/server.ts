"use server"

import { createServerFn } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { users } from "@/db/schema"
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
export const updateProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ name: z.string().trim().max(120) }))
  .handler(async ({ data, context }) => {
    await db
      .update(users)
      .set({ name: data.name === "" ? null : data.name, updatedAt: new Date() })
      .where(eq(users.id, context.session.user.id))
  })
