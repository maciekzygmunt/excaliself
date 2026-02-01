"use server"

import { redirect } from "@tanstack/react-router"
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
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const result = await db.select({ count: count() }).from(users)
    return result[0].count
  },
)

export const setupAdmin = createServerFn({ method: "POST" })
  .inputValidator(
    (data: { email: string; password: string; name: string }) => data,
  )
  .handler(async ({ data }) => {
    const userCount = await getUserCount()
    if (userCount > 0) {
      throw redirect({ to: "/login" })
    }

    const result = await auth.api.signUpEmail({
      body: {
        email: data.email,
        password: data.password,
        name: data.name,
      },
    })

    if (!result.user) {
      throw new Error("Failed to create admin account")
    }

    await db
      .update(users)
      .set({ role: "admin", name: data.name })
      .where(eq(users.id, result.user.id))
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
      await db.transaction(async (tx) => {
        const [user] = await tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))

        if (!user) {
          throw new Error(`User not found: ${userId}`)
        }

        const userDrawings = await tx
          .select({ id: drawings.id })
          .from(drawings)
          .where(eq(drawings.ownerId, userId))
        const drawingIds = userDrawings.map((d) => d.id)

        if (drawingIds.length > 0) {
          await tx
            .delete(drawingFiles)
            .where(inArray(drawingFiles.drawingId, drawingIds))
        }

        await tx.delete(drawings).where(eq(drawings.ownerId, userId))
        await tx.delete(folders).where(eq(folders.ownerId, userId))
        await tx.delete(sessions).where(eq(sessions.userId, userId))
        await tx.delete(accounts).where(eq(accounts.userId, userId))
        await tx.delete(invites).where(eq(invites.invitedBy, userId))
        await tx
          .update(invites)
          .set({ usedBy: null })
          .where(eq(invites.usedBy, userId))
        await tx
          .delete(verifications)
          .where(eq(verifications.identifier, user.email))
        await tx.delete(users).where(eq(users.id, userId))
      })
    } catch (error) {
      console.error("Failed to delete user:", userId, error)
      throw error
    }
  })
