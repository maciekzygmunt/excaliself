"use server"

import { randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { drawingFiles, drawings } from "@/lib/db/schema"
import { authMiddleware } from "@/middleware/auth"

export const getDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const userId = context.session.user.id
    return context.db
      .select()
      .from(drawings)
      .where(eq(drawings.ownerId, userId))
      .orderBy(desc(drawings.updatedAt))
  })

export const getDrawingWithFiles = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator((id: string) => id)
  .handler(async ({ data, context }) => {
    const id = data
    const userId = context.session.user.id
    const result = await context.db
      .select()
      .from(drawings)
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
    const drawing = result[0]
    if (!drawing) return null

    const files = await context.db
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
    const name = data.name ?? "Untitled"

    await context.db.insert(drawings).values({
      id,
      name,
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
  .handler(async ({ data: { updateData, id }, context }) => {
    const userId = context.session.user.id
    const cleanedUpdateData = Object.fromEntries(
      Object.entries(updateData).filter(([, value]) => value !== undefined),
    )
    await context.db
      .update(drawings)
      .set({ ...cleanedUpdateData, updatedAt: new Date() })
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
  })

export const deleteDrawing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data, context }) => {
    const id = data
    const userId = context.session.user.id
    await context.db
      .delete(drawings)
      .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
  })

export const updateDrawingFiles = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      drawingId: z.string(),
      files: z.array(
        z.object({
          fileId: z.string(),
          mimeType: z.string(),
          dataUrl: z.string(),
        }),
      ),
    }),
  )
  .handler(async ({ data: { drawingId, files }, context }) => {
    await context.db
      .delete(drawingFiles)
      .where(eq(drawingFiles.drawingId, drawingId))

    if (files.length > 0) {
      await context.db.insert(drawingFiles).values(
        files.map((file) => ({
          id: randomUUID(),
          drawingId,
          fileId: file.fileId,
          mimeType: file.mimeType,
          dataUrl: file.dataUrl,
          createdAt: new Date(),
        })),
      )
    }
  })
