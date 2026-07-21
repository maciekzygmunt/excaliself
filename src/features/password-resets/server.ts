"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, isNull } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { accounts, passwordResets, sessions, users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

const usableReset = (token: string) =>
  and(
    eq(passwordResets.token, token),
    isNull(passwordResets.usedAt),
    gt(passwordResets.expiresAt, new Date()),
  )

const pendingResetsForUser = (userId: string) =>
  and(eq(passwordResets.userId, userId), isNull(passwordResets.usedAt))

export const createPasswordReset = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data, context }) => {
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, data.userId))
    if (!target) throw new Error("User not found")

    const id = randomUUID()
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

    // Generating again replaces the outstanding link — at most one usable
    // reset per user, so a revoked-and-regenerated link can't resurrect an
    // older copy.
    await db.delete(passwordResets).where(pendingResetsForUser(data.userId))
    await db.insert(passwordResets).values({
      id,
      token,
      userId: data.userId,
      createdBy: context.session.user.id,
      expiresAt,
      createdAt: new Date(),
    })

    return { token }
  })

export const revokePasswordReset = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.object({ userId: z.string().min(1) }))
  .handler(async ({ data }) => {
    await db.delete(passwordResets).where(pendingResetsForUser(data.userId))
  })

// Tokens are credentials and stay server-side — the members list only needs
// to know which users have a link outstanding.
export const getPendingPasswordResets = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () =>
    db
      .select({ userId: passwordResets.userId })
      .from(passwordResets)
      .where(
        and(
          isNull(passwordResets.usedAt),
          gt(passwordResets.expiresAt, new Date()),
        ),
      ),
  )

/**
 * Public (pre-auth) check of a reset token. Returns only what the
 * set-new-password page needs — the target's email for the subtitle —
 * never the reset row itself.
 */
export const validatePasswordReset = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: token }) => {
    const [reset] = await db
      .select({ email: users.email })
      .from(passwordResets)
      .innerJoin(users, eq(passwordResets.userId, users.id))
      .where(usableReset(token))
    if (!reset) return null
    return { email: reset.email }
  })

export const resetPasswordWithToken = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ token: z.string().min(1), password: z.string().min(8) }),
  )
  .handler(async ({ data }) => {
    // Hash with better-auth's own hasher so signInEmail verifies against it;
    // the credential row is written directly — same direct-drizzle style as
    // the rest of the codebase.
    const authContext = await auth.$context
    const hash = await authContext.password.hash(data.password)

    // One transaction: the conditional consume stops two concurrent
    // submissions from both setting the password, and a failure past that
    // point rolls the consume back — a single-use link must never burn
    // without the password actually changing.
    const email = await db.transaction(async (tx) => {
      const consumed = await tx
        .update(passwordResets)
        .set({ usedAt: new Date() })
        .where(usableReset(data.token))
        .returning({ userId: passwordResets.userId })
      if (consumed.length === 0) {
        throw new Error("Invalid or expired reset link")
      }
      const userId = consumed[0].userId

      const [user] = await tx
        .select({ email: users.email })
        .from(users)
        .where(eq(users.id, userId))
      if (!user) throw new Error("Invalid or expired reset link")

      const updated = await tx
        .update(accounts)
        .set({ password: hash, updatedAt: new Date() })
        .where(
          and(
            eq(accounts.userId, userId),
            eq(accounts.providerId, "credential"),
          ),
        )
        .returning({ id: accounts.id })
      if (updated.length === 0) throw new Error("Failed to set password")

      // Every existing session dies — the holder of the link may not be
      // the only one signed in as this user.
      await tx.delete(sessions).where(eq(sessions.userId, userId))
      return user.email
    })

    // The fresh sign-in mints the only surviving session, and
    // tanstackStartCookies copies its cookie onto this server function's
    // response, so the browser lands in the app already authenticated.
    await auth.api.signInEmail({
      body: { email, password: data.password },
    })
  })
