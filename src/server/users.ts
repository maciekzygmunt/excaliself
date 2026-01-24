"use server"

import { createServerFn } from "@tanstack/react-start"
import { count, eq, inArray } from "drizzle-orm"
import z from "zod"
import {
  accounts,
  drawingFiles,
  drawings,
  folders,
  invites,
  sessions,
  users,
  verifications,
} from "@/lib/db/schema"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const result = await context.db.select({ count: count() }).from(users)
    return result[0].count
  },
)

export const getUserById = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    const result = await context.db.select().from(users).where(eq(users.id, id))
    return result[0] || null
  })

export const getAllUsers = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    return context.db.select().from(users)
  },
)

export const updateUserRole = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ userId: z.string(), role: z.enum(["admin", "user"]) }),
  )
  .handler(async ({ data: { userId, role }, context }) => {
    await context.db
      .update(users)
      .set({ role, updatedAt: new Date() })
      .where(eq(users.id, userId))
  })

export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string(), name: z.string().nullable() }))
  .handler(async ({ data: { userId, name }, context }) => {
    await context.db
      .update(users)
      .set({ role: "admin", name })
      .where(eq(users.id, userId))
  })

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator(z.string())
  .handler(async ({ data: userId, context }) => {
    try {
      context.db.transaction((tx) => {
        const user = tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .get()

        if (!user) {
          throw new Error(`User not found: ${userId}`)
        }

        const userDrawings = tx
          .select({ id: drawings.id })
          .from(drawings)
          .where(eq(drawings.ownerId, userId))
          .all()
        const drawingIds = userDrawings.map((d) => d.id)

        if (drawingIds.length > 0) {
          tx.delete(drawingFiles)
            .where(inArray(drawingFiles.drawingId, drawingIds))
            .run()
        }

        tx.delete(drawings).where(eq(drawings.ownerId, userId)).run()
        tx.delete(folders).where(eq(folders.ownerId, userId)).run()
        tx.delete(sessions).where(eq(sessions.userId, userId)).run()
        tx.delete(accounts).where(eq(accounts.userId, userId)).run()
        tx.delete(invites).where(eq(invites.invitedBy, userId)).run()
        tx.update(invites)
          .set({ usedBy: null })
          .where(eq(invites.usedBy, userId))
          .run()
        tx.delete(verifications)
          .where(eq(verifications.identifier, user.email))
          .run()
        tx.delete(users).where(eq(users.id, userId)).run()
      })
    } catch (error) {
      console.error("Failed to delete user:", userId, error)
      throw error
    }
  })
