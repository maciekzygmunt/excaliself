"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray, isNotNull, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings, folders } from "@/db/schema"
import { assertFolderTarget } from "@/features/folders/ownership"
import { findNearestLiveAncestorId } from "@/features/folders/subtree"
import { authMiddleware } from "@/middleware/auth"

const persistedFileSchema = z.object({
  fileId: z.string(),
  mimeType: z.string(),
  dataUrl: z.string(),
})

export const getDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id
    return db
      .select()
      .from(drawings)
      .where(and(eq(drawings.ownerId, userId), isNull(drawings.deletedAt)))
      .orderBy(desc(drawings.updatedAt))
  })

export const getDrawingWithFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
    // Trashed drawings load too (deletedAt set) so /draw/$id can render the
    // read-only trashed view (spec §5.11) instead of a dead end. Writes stay
    // blocked server-side in saveDrawingScene regardless.
    const [drawing] = await db
      .select()
      .from(drawings)
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
    if (!drawing) return null

    const files = await db
      .select()
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, id))

    return { ...drawing, files }
  })

export const createDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      name: z.string().min(1).optional(),
      folderId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id
    if (data.folderId) await assertFolderTarget(db, userId, data.folderId)
    const id = randomUUID()
    const now = new Date()

    await db.insert(drawings).values({
      id,
      name: data.name ?? "Untitled",
      data: JSON.stringify({ elements: [], appState: {} }),
      folderId: data.folderId ?? null,
      ownerId: userId,
      isPublic: false,
      createdAt: now,
      updatedAt: now,
    })

    return id
  })

export const updateDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      updateData: z.object({
        name: z.string().optional(),
        folderId: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(async ({ data: { id, updateData }, context }) => {
    const userId = context.session.user.id
    if (updateData.folderId) {
      await assertFolderTarget(db, userId, updateData.folderId)
    }
    // Ownership is enforced in the statement itself; zero rows means "not
    // found" so non-owners can't tell the resource exists. Trashed drawings
    // are treated the same — no edits while in the trash.
    const updated = await db
      .update(drawings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(drawings.id, id),
          eq(drawings.ownerId, userId),
          isNull(drawings.deletedAt),
        ),
      )
      .returning({ id: drawings.id })
    if (updated.length === 0) throw new Error("Drawing not found")
  })

export const setDrawingStarred = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      starred: z.boolean(),
    }),
  )
  .handler(async ({ data: { id, starred }, context }) => {
    const userId = context.session.user.id
    // Deliberately leaves updatedAt alone: starring is not an edit and must
    // not reshuffle recency-ordered lists.
    const updated = await db
      .update(drawings)
      .set({ starred })
      .where(
        and(
          eq(drawings.id, id),
          eq(drawings.ownerId, userId),
          isNull(drawings.deletedAt),
        ),
      )
      .returning({ id: drawings.id })
    if (updated.length === 0) throw new Error("Drawing not found")
  })

export const saveDrawingScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(
    z.object({
      id: z.string(),
      data: z.string(),
      files: z.array(persistedFileSchema),
    }),
  )
  .handler(async ({ data: { id, data: sceneData, files }, context }) => {
    const userId = context.session.user.id

    await db.transaction(async (tx) => {
      const now = new Date()

      // Refuses writes to trashed drawings so a stale open tab can't keep
      // autosaving into the trash. This guard is permanent: even once trashed
      // drawings become viewable read-only (#53), writes stay blocked here.
      const updated = await tx
        .update(drawings)
        .set({ data: sceneData, updatedAt: now })
        .where(
          and(
            eq(drawings.id, id),
            eq(drawings.ownerId, userId),
            isNull(drawings.deletedAt),
          ),
        )
        .returning({ id: drawings.id })
      if (updated.length === 0) throw new Error("Drawing not found")

      const existing = await tx
        .select({ fileId: drawingFiles.fileId })
        .from(drawingFiles)
        .where(eq(drawingFiles.drawingId, id))
      const existingFileIds = new Set(existing.map((row) => row.fileId))
      const incomingFileIds = new Set(files.map((file) => file.fileId))

      const fileIdsToRemove = [...existingFileIds].filter(
        (fileId) => !incomingFileIds.has(fileId),
      )
      const filesToInsert = files.filter(
        (file) => !existingFileIds.has(file.fileId),
      )

      if (fileIdsToRemove.length > 0) {
        await tx
          .delete(drawingFiles)
          .where(
            and(
              eq(drawingFiles.drawingId, id),
              inArray(drawingFiles.fileId, fileIdsToRemove),
            ),
          )
      }

      if (filesToInsert.length > 0) {
        await tx.insert(drawingFiles).values(
          filesToInsert.map((file) => ({
            id: randomUUID(),
            drawingId: id,
            fileId: file.fileId,
            mimeType: file.mimeType,
            dataUrl: file.dataUrl,
            createdAt: now,
          })),
        )
      }
    })
  })

export const trashDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
    // Soft delete: the row keeps its folderId so undo restores it in place.
    // Deliberately leaves updatedAt alone — trashing is not an edit and must
    // not reshuffle recency-ordered lists once the drawing is restored.
    const trashed = await db
      .update(drawings)
      .set({ deletedAt: new Date(), trashRootId: id })
      .where(
        and(
          eq(drawings.id, id),
          eq(drawings.ownerId, userId),
          isNull(drawings.deletedAt),
        ),
      )
      .returning({ id: drawings.id })
    if (trashed.length === 0) throw new Error("Drawing not found")
  })

/**
 * Restores a trashed drawing with the full landing rules (spec §5.11): back
 * to its original folder when that folder is live; to the nearest live
 * ancestor when the folder is trashed (never resurrecting a trashed parent
 * chain); to root when the folder no longer exists at all — the caller gets
 * `originalFolderGone` so it can show the "Restored to root" toast.
 */
export const restoreDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id

    return db.transaction(async (tx) => {
      const restored = await tx
        .update(drawings)
        .set({ deletedAt: null, trashRootId: null })
        .where(
          and(
            eq(drawings.id, id),
            eq(drawings.ownerId, userId),
            isNotNull(drawings.deletedAt),
          ),
        )
        .returning({ id: drawings.id, folderId: drawings.folderId })
      if (restored.length === 0) throw new Error("Drawing not found")

      const originalFolderId = restored[0].folderId
      if (!originalFolderId) return { originalFolderGone: false }

      const ownerFolders = await tx
        .select({
          id: folders.id,
          parentId: folders.parentId,
          deletedAt: folders.deletedAt,
        })
        .from(folders)
        .where(eq(folders.ownerId, userId))

      const landingId = findNearestLiveAncestorId(
        ownerFolders,
        originalFolderId,
      )
      if (landingId !== originalFolderId) {
        await tx
          .update(drawings)
          .set({ folderId: landingId })
          .where(eq(drawings.id, id))
      }

      return {
        originalFolderGone: !ownerFolders.some(
          (folder) => folder.id === originalFolderId,
        ),
      }
    })
  })
