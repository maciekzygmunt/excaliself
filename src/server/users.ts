"use server"

import { createServerFn } from "@tanstack/react-start"
import { count, eq } from "drizzle-orm"
import z from "zod"
import { users } from "@/lib/db/schema"

export const getUserCount = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    const result = await context.db.select({ count: count() }).from(users)
    return result[0].count
  },
)

export const isSetupComplete = createServerFn({ method: "GET" }).handler(
  async () => {
    const userCount = await getUserCount()
    return userCount > 0
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
