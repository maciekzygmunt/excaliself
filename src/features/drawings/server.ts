"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings, folders } from "@/db/schema"
import { endRooms } from "@/features/collab/room-registry"
import { assertFolderTarget } from "@/features/folders/ownership"
import { findNearestLiveAncestorId } from "@/features/folders/subtree"
import { authMiddleware } from "@/middleware/auth"
import { bytesToDataUrl } from "./file-bytes"
import { drawingListColumns } from "./list-columns"
import { writeDrawingScene } from "./scene-write"

export const getDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id
    return db
      .select(drawingListColumns)
      .from(drawings)
      .where(and(eq(drawings.ownerId, userId), isNull(drawings.deletedAt)))
      .orderBy(desc(drawings.updatedAt))
  })

/** One drawing's stored scene, for its card preview. Trashed ones too. */
export const getDrawingScene = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const [drawing] = await db
      .select({ data: drawings.data })
      .from(drawings)
      .where(
        and(eq(drawings.id, id), eq(drawings.ownerId, context.session.user.id)),
      )
    return drawing?.data ?? null
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
      .select({
        fileId: drawingFiles.fileId,
        mimeType: drawingFiles.mimeType,
        bytes: drawingFiles.bytes,
        createdAt: drawingFiles.createdAt,
      })
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, id))

    return {
      ...drawing,
      files: files.map(({ bytes, ...file }) => ({
        ...file,
        dataUrl: bytesToDataUrl(file.mimeType, bytes),
      })),
    }
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
      files: z.array(z.object({ fileId: z.string(), dataUrl: z.string() })),
    }),
  )
  .handler(async ({ data: { id, data: sceneData, files }, context }) =>
    writeDrawingScene(db, context.session.user.id, {
      id,
      data: sceneData,
      files,
    }),
  )

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

    // Flush and close the live room. The share row survives, so restore
    // revives the link.
    await endRooms([id])
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
