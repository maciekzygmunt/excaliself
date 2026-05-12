"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings } from "@/db/schema"
import { authMiddleware } from "@/middleware/auth"

const persistedFileSchema = z.object({
  fileId: z.string(),
  mimeType: z.string(),
  dataUrl: z.string(),
})

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function requireOwnedDrawing(
  tx: typeof db | Tx,
  id: string,
  userId: string,
): Promise<{ id: string }> {
  const [row] = await tx
    .select({ id: drawings.id })
    .from(drawings)
    .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
  if (!row) throw new Error("Drawing not found")
  return row
}

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
        data: z.string().optional(),
        thumbnail: z.string().optional(),
        folderId: z.string().nullable().optional(),
      }),
    }),
  )
  .handler(async ({ data: { id, updateData }, context }) => {
    const userId = context.session.user.id
    await requireOwnedDrawing(db, id, userId)
    await db
      .update(drawings)
      .set({ ...updateData, updatedAt: new Date() })
      .where(eq(drawings.id, id))
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
      await requireOwnedDrawing(tx, id, userId)
      const now = new Date()

      await tx
        .update(drawings)
        .set({ data: sceneData, updatedAt: now })
        .where(eq(drawings.id, id))
      await tx.delete(drawingFiles).where(eq(drawingFiles.drawingId, id))

      if (files.length > 0) {
        await tx.insert(drawingFiles).values(
          files.map((file) => ({
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
    await requireOwnedDrawing(db, id, userId)
    await db.delete(drawings).where(eq(drawings.id, id))
  })
