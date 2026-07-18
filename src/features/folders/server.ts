"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { folders } from "@/db/schema"
import { authMiddleware } from "@/middleware/auth"

export const getFolders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id
    return db
      .select()
      .from(folders)
      .where(eq(folders.ownerId, userId))
      .orderBy(asc(folders.name))
  })

export const createFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      name: z.string().min(1),
      parentId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id
    const id = randomUUID()
    const now = new Date()
    const parentId = data.parentId ?? null

    await db.insert(folders).values({
      id,
      name: data.name,
      ownerId: userId,
      parentId,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      name: data.name,
      ownerId: userId,
      parentId,
      createdAt: now,
      updatedAt: now,
    }
  })

export const updateFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
    z.object({
      id: z.string(),
      name: z.string().min(1).optional(),
      parentId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id

    const updateFields: { name?: string; parentId?: string | null } = {}
    if (data.name !== undefined) updateFields.name = data.name
    if (data.parentId !== undefined) updateFields.parentId = data.parentId

    // Ownership is enforced in the statement itself; zero rows means "not
    // found" so non-owners can't tell the resource exists.
    const updated = await db
      .update(folders)
      .set({ ...updateFields, updatedAt: new Date() })
      .where(and(eq(folders.id, data.id), eq(folders.ownerId, userId)))
      .returning({ id: folders.id })
    if (updated.length === 0) throw new Error("Folder not found")
  })

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
    const deleted = await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.ownerId, userId)))
      .returning({ id: folders.id })
    if (deleted.length === 0) throw new Error("Folder not found")
  })
