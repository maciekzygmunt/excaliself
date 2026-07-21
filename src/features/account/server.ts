"use server"

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { sessions, users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"
import { compareSessions } from "./sessions"

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

// Session tokens are credentials — rows go to the client keyed by id only,
// and the id→token mapping needed for revocation stays server-side.
export const listActiveSessions = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const active = await auth.api.listSessions({
      headers: getRequestHeaders(),
    })
    const currentId = context.session.session.id
    return active
      .map((session) => ({
        id: session.id,
        ipAddress: session.ipAddress ?? null,
        userAgent: session.userAgent ?? null,
        lastActiveAt: session.updatedAt,
        current: session.id === currentId,
      }))
      .sort(compareSessions)
  })

// The current session is only ever ended through sign-out, so the row action
// can't strand the user; revoking it here is rejected outright.
export const revokeSessionById = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ id: z.string() }))
  .handler(async ({ data, context }) => {
    if (data.id === context.session.session.id) {
      throw new Error("The current session cannot be revoked")
    }
    const [target] = await db
      .select({ token: sessions.token, userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, data.id))
    if (!target || target.userId !== context.session.user.id) {
      throw new Error("Session not found")
    }
    await auth.api.revokeSession({
      body: { token: target.token },
      headers: getRequestHeaders(),
    })
  })

export const revokeOtherSessions = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async () => {
    await auth.api.revokeOtherSessions({ headers: getRequestHeaders() })
  })
