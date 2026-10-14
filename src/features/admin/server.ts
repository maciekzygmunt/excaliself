"use server"

import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { count, eq, or } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { sessions, users } from "@/db/schema"
import { setupFieldsSchema } from "@/features/auth/schema"
import { endRooms } from "@/features/collab/room-registry"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"
import {
  countOwnedContent,
  deleteUserAccount,
  sharedDrawingIds,
} from "./delete-user"
import { isLastAdmin } from "./roles"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const [result] = await db.select({ count: count() }).from(users)
    return result.count
  },
)

export const setupAdmin = createServerFn({ method: "POST" })
  .validator(setupFieldsSchema)
  .handler(async ({ data }) => {
    const userCount = await getUserCount()
    if (userCount > 0) {
      throw redirect({ to: "/login" })
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        // Display names are only ever set in Settings; "" means unset and
        // the email-prefix fallback covers it (spec §5.12).
        name: "",
      },
    })

    if (!result.user) {
      throw new Error("Failed to create admin account")
    }

    await db
      .update(users)
      .set({ role: "admin" })
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
  .validator(z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }))
  .handler(async ({ data, context }) => {
    const callerId = context.session.user.id
    await db.transaction(async (tx) => {
      // One locking read over the caller, the target, and every admin. The
      // lock serializes concurrent role changes so two demotions can't both
      // pass the last-admin check, and the deterministic id order keeps
      // overlapping transactions from deadlocking on each other's rows.
      const relevant = await tx
        .select({ id: users.id, role: users.role })
        .from(users)
        .where(
          or(
            eq(users.role, "admin"),
            eq(users.id, callerId),
            eq(users.id, data.userId),
          ),
        )
        .orderBy(users.id)
        .for("update")

      // Recheck the caller under the lock: the middleware's fresh read can
      // go stale in the gap before this transaction, letting a just-demoted
      // admin race their own re-promotion through.
      const caller = relevant.find((row) => row.id === callerId)
      if (caller?.role !== "admin") {
        throw new Error("Only admins can change roles")
      }

      const admins = relevant
        .filter((row) => row.role === "admin")
        .map((row) => row.id)
      if (data.role === "user" && isLastAdmin(admins, data.userId)) {
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
  .validator(z.string())
  .handler(async ({ data: userId, context }) => {
    const shared = await sharedDrawingIds(db, userId)
    await deleteUserAccount(db, context.session.user.id, userId)
    // Hang up on live rooms; their flush finds no row and writes nothing.
    await endRooms(shared)
  })

// Feeds the tier-3 confirm's count-aware copy ("…and permanently delete
// their 23 drawings and 4 folders").
export const getUserContentCounts = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .validator(z.string())
  .handler(async ({ data: userId }) => countOwnedContent(db, userId))
