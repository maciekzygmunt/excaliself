"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings, spaces, stars } from "@/db/schema"
import { userDisplayName } from "@/features/account/display-name"
import { endTrashedRooms } from "@/features/collab/room-registry"
import { assertFolderTarget } from "@/features/folders/ownership"
import { accessibleTo } from "@/features/spaces/access"
import { restoreDrawingUnit } from "@/features/trash/restore"
import { authMiddleware } from "@/middleware/auth"
import { bytesToDataUrl } from "./file-bytes"
import { listDrawings } from "./list"
import { writeDrawingScene } from "./scene-write"

export const getDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(({ context }) => listDrawings(db, context.session.user.id))

/** One drawing's stored scene, for its card preview. Trashed ones too. */
export const getDrawingScene = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const [drawing] = await db
      .select({ data: drawings.data })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, context.session.user.id),
        ),
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
      .where(and(eq(drawings.id, id), accessibleTo(drawings, userId)))
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
      // Ignored inside a folder: the drawing takes the folder's space.
      space: z.enum(spaces).default("private"),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id
    const space = data.folderId
      ? await assertFolderTarget(db, userId, data.folderId)
      : data.space
    const id = randomUUID()
    const now = new Date()

    await db.insert(drawings).values({
      id,
      name: data.name ?? "Untitled",
      data: JSON.stringify({ elements: [], appState: {} }),
      folderId: data.folderId ?? null,
      space,
      createdBy: userId,
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
    const targetSpace = updateData.folderId
      ? await assertFolderTarget(db, userId, updateData.folderId)
      : undefined
    // Access is enforced in the statement itself; zero rows means "not
    // found" so others can't tell a private drawing exists. Trashed drawings
    // are treated the same — no edits while in the trash — and so is a move
    // into a folder of the other space.
    const updated = await db
      .update(drawings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, userId),
          isNull(drawings.deletedAt),
          targetSpace && eq(drawings.space, targetSpace),
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
    // A star is the caller's own row, so the drawing's updatedAt stays put:
    // starring is not an edit and must not reshuffle recency-ordered lists.
    const [drawing] = await db
      .select({ id: drawings.id })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, userId),
          isNull(drawings.deletedAt),
        ),
      )
    if (!drawing) throw new Error("Drawing not found")

    if (starred) {
      await db
        .insert(stars)
        .values({ userId, drawingId: id })
        .onConflictDoNothing()
    } else {
      await db
        .delete(stars)
        .where(and(eq(stars.userId, userId), eq(stars.drawingId, id)))
    }
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
      .set({ deletedAt: new Date(), trashRootId: id, deletedBy: userId })
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, userId),
          isNull(drawings.deletedAt),
        ),
      )
      .returning({ id: drawings.id })
    if (trashed.length === 0) throw new Error("Drawing not found")

    // Flush and close the live room. The share row survives, so restore
    // revives the link.
    await endTrashedRooms([id], {
      userId,
      name: userDisplayName(context.session.user),
    })
  })

/** Restores a trashed drawing; see restoreDrawingUnit for the landing rules. */
export const restoreDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: id, context }) =>
    restoreDrawingUnit(db, context.session.user.id, id),
  )
