"use server"

import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { count, eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { drawings, folders, sessions, users } from "@/db/schema"
import { deleteUserAccount } from "@/features/admin/delete-user"
import { setupFieldsSchema } from "@/features/auth/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

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

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: userId, context }) => {
    await deleteUserAccount(db, context.session.user.id, userId)
  })

// Feeds the tier-3 confirm's count-aware copy ("…and permanently delete
// their 23 drawings and 4 folders"). Counts everything owned — trashed rows
// included, since the delete cascade destroys those too.
export const getUserContentCounts = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: userId }) => {
    const [[drawingCount], [folderCount]] = await Promise.all([
      db
        .select({ count: count() })
        .from(drawings)
        .where(eq(drawings.ownerId, userId)),
      db
        .select({ count: count() })
        .from(folders)
        .where(eq(folders.ownerId, userId)),
    ])
    return { drawings: drawingCount.count, folders: folderCount.count }
  })
