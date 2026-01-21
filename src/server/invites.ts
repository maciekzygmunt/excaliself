"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, gt, isNull } from "drizzle-orm"
import z from "zod"
import { invites } from "@/lib/db/schema"
import { authMiddleware } from "@/middleware/auth"

export const createInvite = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const id = randomUUID()
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    const adminId = context.session.user.id

    await context.db.insert(invites).values({
      id,
      token,
      invitedBy: adminId,
      expiresAt,
      createdAt: new Date(),
    })

    return { id, token }
  })

export const validateInvite = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: token, context }) => {
    const result = await context.db
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
  .handler(async ({ data, context }) => {
    await context.db
      .update(invites)
      .set({ usedAt: new Date(), usedBy: data.userId })
      .where(eq(invites.token, data.token))
  })

export const getPendingInvites = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    return context.db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
  },
)

export const getAllInvites = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    return context.db.select().from(invites)
  },
)

export const deleteInvite = createServerFn({ method: "POST" })
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    await context.db.delete(invites).where(eq(invites.id, id))
  })
