"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { and, eq, gt, isNull } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { invites } from "@/lib/db/schema"

export async function createInvite(email: string, invitedById: string) {
  const db = getDb()
  const id = randomUUID()
  const token = randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

  await db.insert(invites).values({
    id,
    email,
    token,
    invitedBy: invitedById,
    expiresAt,
    createdAt: new Date(),
  })

  return { id, token }
}

export async function validateInvite(token: string) {
  const db = getDb()
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
}

export async function consumeInvite(token: string) {
  const db = getDb()
  await db
    .update(invites)
    .set({ usedAt: new Date() })
    .where(eq(invites.token, token))
}

export async function getPendingInvites() {
  const db = getDb()
  return db
    .select()
    .from(invites)
    .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
}

export async function getAllInvites() {
  const db = getDb()
  return db.select().from(invites)
}

export async function deleteInvite(id: string) {
  const db = getDb()
  await db.delete(invites).where(eq(invites.id, id))
}
