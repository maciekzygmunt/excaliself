"use server"

import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { count, eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { users } from "@/db/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const [result] = await db.select({ count: count() }).from(users)
    return result.count
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

export const getAllUsers = createServerFn({ method: "GET" })
  .middleware([adminMiddleware])
  .handler(async () => db.select().from(users))

export const deleteUser = createServerFn({ method: "POST" })
  .middleware([adminMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: userId }) => {
    const deleted = await db
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id })

    if (deleted.length === 0) {
      throw new Error(`User not found: ${userId}`)
    }
  })
