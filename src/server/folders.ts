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

    await db.insert(folders).values({
      id,
      name: data.name,
      ownerId: userId,
      parentId: data.parentId ?? null,
      createdAt: now,
      updatedAt: now,
    })

    return {
      id,
      name: data.name,
      ownerId: userId,
      parentId: data.parentId ?? null,
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
    const cleanedUpdateData = Object.fromEntries(
      Object.entries({
        name: data.name,
        parentId: data.parentId,
      }).filter(([, value]) => value !== undefined),
    )

    await db
      .update(folders)
      .set({ ...cleanedUpdateData, updatedAt: new Date() })
      .where(and(eq(folders.id, data.id), eq(folders.ownerId, userId)))
  })

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: folderId, context }) => {
    const userId = context.session.user.id
    await db
      .delete(folders)
      .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)))
  })
