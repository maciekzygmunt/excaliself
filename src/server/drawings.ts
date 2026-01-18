"use server"

import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { getDb } from "@/lib/db"
import { drawingFiles, drawings } from "@/lib/db/schema"

export async function getDrawings(userId: string) {
  const db = getDb()
  return db
    .select()
    .from(drawings)
    .where(eq(drawings.ownerId, userId))
    .orderBy(desc(drawings.updatedAt))
}

export async function getDrawing(id: string, userId: string) {
  const db = getDb()
  const result = await db
    .select()
    .from(drawings)
    .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
  return result[0] || null
}

export async function getDrawingWithFiles(id: string, userId: string) {
  const db = getDb()
  const drawing = await getDrawing(id, userId)
  if (!drawing) return null

  const files = await db
    .select()
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, id))

  return { ...drawing, files }
}

export async function createDrawing(userId: string, name: string = "Untitled") {
  const db = getDb()
  const id = randomUUID()
  const now = new Date()

  await db.insert(drawings).values({
    id,
    name,
    data: JSON.stringify({ elements: [], appState: {} }),
    ownerId: userId,
    isPublic: false,
    createdAt: now,
    updatedAt: now,
  })

  return id
}

export async function updateDrawing(
  id: string,
  userId: string,
  data: { name?: string; data?: string; thumbnail?: string },
) {
  const db = getDb()
  await db
    .update(drawings)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
}

export async function deleteDrawing(id: string, userId: string) {
  const db = getDb()
  await db
    .delete(drawings)
    .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
}

export async function updateDrawingFiles(
  drawingId: string,
  files: { fileId: string; mimeType: string; dataUrl: string }[],
) {
  const db = getDb()
  await db.delete(drawingFiles).where(eq(drawingFiles.drawingId, drawingId))

  if (files.length > 0) {
    await db.insert(drawingFiles).values(
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
}
