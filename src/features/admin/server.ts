"use server"

import { redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { count, eq } from "drizzle-orm"
import z from "zod"
import { db } from "@/db"
import { users, verifications } from "@/db/schema"
import { registerFieldsSchema } from "@/features/auth/schema"
import { auth } from "@/lib/auth"
import { adminMiddleware } from "@/middleware/admin"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async () => {
    const [result] = await db.select({ count: count() }).from(users)
    return result.count
  },
)

export const setupAdmin = createServerFn({ method: "POST" })
  .inputValidator(registerFieldsSchema)
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
    await db.transaction(async (tx) => {
      const deleted = await tx
        .delete(users)
        .where(eq(users.id, userId))
        .returning({ email: users.email })

      if (deleted.length === 0) {
        throw new Error(`User not found: ${userId}`)
      }

      // verifications has no FK to users — it's keyed by identifier (email)
      // for password resets, email verification, etc. Clean it up manually so
      // orphan rows don't collide with a future re-registration of the same email.
      await tx
        .delete(verifications)
        .where(eq(verifications.identifier, deleted[0].email))
    })
  })
