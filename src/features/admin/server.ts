"use server"

import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { count, eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { sessions, users, verifications } from "@/db/schema"
import { setupFieldsSchema } from "@/features/auth/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"
import { isLastAdmin } from "./roles"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const [result] = await db.select({ count: count() }).from(users)
    return result.count
  },
)

export const setupAdmin = createServerFn({ method: "POST" })
  .inputValidator(setupFieldsSchema)
  .handler(async ({ data }) => {
    const userCount = await getUserCount()
    if (userCount > 0) {
      throw redirect({ to: "/login" })
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        // better-auth requires a name in the sign-up body; it's nulled just
        // below — display names are only ever set in Settings, and the
        // email-prefix fallback covers everyone else (spec §5.12).
        name: data.email.split("@")[0],
      },
    })

    if (!result.user) {
      throw new Error("Failed to create admin account")
    }

    await db
      .update(users)
      .set({ role: "admin", name: null })
      .where(eq(users.id, result.user.id))

    // The sign-up session was minted before the promotion, so its cookie
    // cache would report role "user" for up to five minutes. Drop it and
    // sign in fresh — tanstackStartCookies copies the new session cookie
    // onto this server-function response, so the browser leaves /setup
    // already authenticated as admin.
    await db.delete(sessions).where(eq(sessions.userId, result.user.id))
    await auth.api.signInEmail({
      body: { email: data.email, password: data.password },
    })
  })

export const getAllUsers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => db.select().from(users))

export const setUserRole = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(
    z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }),
  )
  .handler(async ({ data }) => {
    await db.transaction(async (tx) => {
      // Lock the admin rows so two concurrent demotions can't both pass the
      // last-admin check and leave the instance with no admin.
      const admins = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, "admin"))
        .for("update")
      if (
        data.role === "user" &&
        isLastAdmin(
          admins.map((admin) => admin.id),
          data.userId,
        )
      ) {
        throw new Error("The last admin can't be demoted")
      }

      const updated = await tx
        .update(users)
        .set({ role: data.role, updatedAt: new Date() })
        .where(eq(users.id, data.userId))
        .returning({ id: users.id })
      if (updated.length === 0) {
        throw new Error(`User not found: ${data.userId}`)
      }
    })
  })

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: userId }) => {
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ email: users.email })

      if (deleted.length === 0) {
        throw new Error(`User not found: ${userId}`)
      }

      // verifications has no FK to users — it's keyed by identifier (email)
      // for password resets, email verification, etc. Clean it up manually so
      // orphan rows don't collide with a future re-registration of the same email.
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, deleted[0].email))
    })
  })
