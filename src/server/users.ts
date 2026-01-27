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
