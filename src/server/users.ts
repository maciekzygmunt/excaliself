"use server"

import { createServerFn } from "@tanstack/react-start"
import { count, eq, inArray } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import {
  accounts,
  drawingFiles,
  drawings,
  folders,
  invites,
  sessions,
  users,
  verifications,
} from "@/db/schema"
import { adminMiddleware } from "@/middleware/admin"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const result = await db.select({ count: count() }).from(users)
    return result[0].count
  },
)

export const createFirstAdmin = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string(), name: z.string().nullable() }))
  .handler(async ({ data: { userId, name } }) => {
    await db
      .update(users)
      .set({ role: "admin", name })
      .where(eq(users.id, userId))
  })

// ADMIN
export const getAllUsers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => {
    return db.select().from(users)
  })

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: userId }) => {
    try {
      db.transaction((tx) => {
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
