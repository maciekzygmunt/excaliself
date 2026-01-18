"use server"

import { getDb } from "@/lib/db"
import { users } from "@/lib/db/schema"
import { count, eq } from "drizzle-orm"

export async function getUserCount() {
  const db = getDb()
  const result = await db.select({ count: count() }).from(users)
  return result[0].count
}

export async function isSetupComplete() {
  const userCount = await getUserCount()
  return userCount > 0
}

export async function getUserById(id: string) {
  const db = getDb()
  const result = await db.select().from(users).where(eq(users.id, id))
  return result[0] || null
}

export async function getAllUsers() {
  const db = getDb()
  return db.select().from(users)
}

export async function updateUserRole(userId: string, role: "admin" | "user") {
  const db = getDb()
  await db
    .update(users)
    .set({ role, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

export async function createFirstAdmin(id: string, name: string | null) {
  const db = getDb()
  const userCount = await getUserCount()
  if (userCount > 0) {
    throw new Error("Admin already exists")
  }

  await db.update(users).set({ role: "admin", name }).where(eq(users.id, id))
}
