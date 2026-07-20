"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, asc, eq, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawings, folders } from "@/db/schema"
import { authMiddleware } from "@/middleware/auth"
import { collectFolderSubtreeIds } from "./subtree"

export const getFolders = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id
    return db
      .select()
      .from(folders)
      .where(and(eq(folders.ownerId, userId), isNull(folders.deletedAt)))
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
    // found" so non-owners can't tell the resource exists. Trashed folders
    // are treated the same — no edits while in the trash.
    const updated = await db
      .update(folders)
      .set({ ...updateFields, updatedAt: new Date() })
      .where(
        and(
          eq(folders.id, data.id),
          eq(folders.ownerId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .returning({ id: folders.id })
    if (updated.length === 0) throw new Error("Folder not found")
  })

/**
 * Soft-deletes a folder and its whole subtree (descendant folders + their
 * drawings) as one trash unit: every swept row gets the same trashRootId so
 * the unit can be restored intact. Rows that were already trashed keep their
 * own unit and are left untouched — restoring this folder must not resurrect
 * things trashed separately before it.
 */
export const trashFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
    const now = new Date()

    await db.transaction(async (tx) => {
      const liveFolders = await tx
        .select({ id: folders.id, parentId: folders.parentId })
        .from(folders)
        .where(and(eq(folders.ownerId, userId), isNull(folders.deletedAt)))
      if (!liveFolders.some((folder) => folder.id === id))
        throw new Error("Folder not found")

      const subtreeIds = [...collectFolderSubtreeIds(liveFolders, id)]

      await tx
        .update(folders)
        .set({ deletedAt: now, trashRootId: id })
        .where(
          and(
            inArray(folders.id, subtreeIds),
            eq(folders.ownerId, userId),
            isNull(folders.deletedAt),
          ),
        )
      // Leaves updatedAt alone (see trashDrawing) so restore is in place.
      await tx
        .update(drawings)
        .set({ deletedAt: now, trashRootId: id })
        .where(
          and(
            inArray(drawings.folderId, subtreeIds),
            eq(drawings.ownerId, userId),
            isNull(drawings.deletedAt),
          ),
        )
    })
  })

/** Restores a folder trash unit: everything trashFolder(id) swept, in place. */
export const restoreFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id

    await db.transaction(async (tx) => {
      const restored = await tx
        .update(folders)
        .set({ deletedAt: null, trashRootId: null })
        .where(and(eq(folders.trashRootId, id), eq(folders.ownerId, userId)))
        .returning({ id: folders.id })
      if (restored.length === 0) throw new Error("Folder not found")

      await tx
        .update(drawings)
        .set({ deletedAt: null, trashRootId: null })
        .where(and(eq(drawings.trashRootId, id), eq(drawings.ownerId, userId)))
    })
  })
