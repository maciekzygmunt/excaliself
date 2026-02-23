"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, isNull } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { invites } from "@/db/schema"
import { auth } from "@/lib/auth"
import { INVITE_EXPIRY_MS } from "@/lib/constants"
import { adminMiddleware } from "@/middleware/admin"

export const validateInvite = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: token }) => {
    const result = await db
      .select()
      .from(invites)
      .where(
        and(
          eq(invites.token, token),
          isNull(invites.usedAt),
          gt(invites.expiresAt, new Date()),
        ),
      )
    return result[0] || null
  })

export const consumeInvite = createServerFn({ method: "POST" })
  .inputValidator(z.object({ token: z.string(), userId: z.string() }))
  .handler(async ({ data }) => {
    await db
      .update(invites)
      .set({ usedAt: new Date(), usedBy: data.userId })
      .where(eq(invites.token, data.token))
  })

export const registerWithInvite = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      token: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      name: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const invite = await validateInvite({ data: data.token })
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

    await consumeInvite({ data: { token: data.token, userId: result.user.id } })

    return { success: true }
  })

// ADMIN
export const createInvite = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .handler(async ({ context }) => {
    const id = randomUUID()
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS)
    const adminId = context.session.user.id

    await db.insert(invites).values({
      id,
      token,
      invitedBy: adminId,
      expiresAt,
      createdAt: new Date(),
    })

    return { id, token }
  })

export const getPendingInvites = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    return db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
  })

export const getAllInvites = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    return db.select().from(invites)
  })

export const deleteInvite = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id }) => {
    await db.delete(invites).where(eq(invites.id, id))
  })
