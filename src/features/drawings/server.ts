"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq, inArray } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings } from "@/db/schema"
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
      .where(eq(drawings.ownerId, userId))
      .orderBy(desc(drawings.updatedAt))
  })

export const getDrawingWithFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((id: string) => id)
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
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
  .inputValidator(
    z.object({
      name: z.string().min(1).optional(),
      folderId: z.string().nullable().optional(),
    }),
  )
  .handler(async ({ data, context }) => {
    const userId = context.session.user.id
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
  .inputValidator(
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
    // Ownership is enforced in the statement itself; zero rows means "not
    // found" so non-owners can't tell the resource exists.
    const updated = await db
      .update(drawings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
      .returning({ id: drawings.id })
    if (updated.length === 0) throw new Error("Drawing not found")
  })

export const setDrawingStarred = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
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
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
      .returning({ id: drawings.id })
    if (updated.length === 0) throw new Error("Drawing not found")
  })

export const saveDrawingScene = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(
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

      const updated = await tx
        .update(drawings)
        .set({ data: sceneData, updatedAt: now })
        .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
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

export const deleteDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: id, context }) => {
    const userId = context.session.user.id
    const deleted = await db
      .delete(drawings)
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
      .returning({ id: drawings.id })
    if (deleted.length === 0) throw new Error("Drawing not found")
  })
