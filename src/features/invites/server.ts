"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, isNull } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { invites } from "@/db/schema"
import { registerFieldsSchema } from "@/features/auth/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

const usableInvite = (token: string) =>
  and(
    eq(invites.token, token),
    isNull(invites.usedAt),
    gt(invites.expiresAt, new Date()),
  )

export const validateInvite = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: token }) => {
    const [invite] = await db.select().from(invites).where(usableInvite(token))
    return invite ?? null
  })

export const registerWithInvite = createServerFn({ method: "POST" })
  .inputValidator(registerFieldsSchema.extend({ token: z.string().min(1) }))
  .handler(async ({ data }) => {
    const [invite] = await db
      .select({ id: invites.id })
      .from(invites)
      .where(usableInvite(data.token))
    if (!invite) {
      throw new Error("Invalid or expired invite link")
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    })

    if (!result.user) {
      throw new Error("Failed to create account")
    }

    // Conditional update so two concurrent signups can't both consume the
    // same invite — only the one that wins the update completes registration.
    const consumed = await db
      .update(invites)
      .set({ usedAt: new Date(), usedBy: result.user.id })
      .where(usableInvite(data.token))
      .returning({ id: invites.id })
    if (consumed.length === 0) {
      throw new Error("Invalid or expired invite link")
    }
  })

export const createInvite = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const id = randomUUID()
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await db.insert(invites).values({
      id,
      token,
      invitedBy: context.session.user.id,
      expiresAt,
      createdAt: new Date(),
    })

    return { id, token }
  })

export const getPendingInvites = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () =>
    db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date()))),
  )

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id }) => {
    await db.delete(invites).where(eq(invites.id, id))
  })
