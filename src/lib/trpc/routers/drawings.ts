import { randomUUID } from "node:crypto"
import { and, desc, eq } from "drizzle-orm"
import { z } from "zod"
import { drawingFiles, drawings } from "@/lib/db/schema"
import { protectedProcedure, router } from "../init"

export const drawingsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    return ctx.db
      .select()
      .from(drawings)
      .where(eq(drawings.ownerId, userId))
      .orderBy(desc(drawings.updatedAt))
  }),

  getWithFiles: protectedProcedure
    .input(z.string())
    .query(async ({ ctx, input: id }) => {
      const userId = ctx.session.user.id
      const result = await ctx.db
        .select()
        .from(drawings)
        .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
      const drawing = result[0]
      if (!drawing) return null

      const files = await ctx.db
        .select()
        .from(drawingFiles)
        .where(eq(drawingFiles.drawingId, id))

      return { ...drawing, files }
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1).optional(),
        folderId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const id = randomUUID()
      const now = new Date()
      const name = input.name ?? "Untitled"

      await ctx.db.insert(drawings).values({
        id,
        name,
        data: JSON.stringify({ elements: [], appState: {} }),
        folderId: input.folderId ?? null,
        ownerId: userId,
        isPublic: false,
        createdAt: now,
        updatedAt: now,
      })

      return id
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        data: z.string().optional(),
        thumbnail: z.string().optional(),
        folderId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const { id, ...updateData } = input
      const cleanedUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(([, value]) => value !== undefined),
      )
      await ctx.db
        .update(drawings)
        .set({ ...cleanedUpdateData, updatedAt: new Date() })
        .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: id }) => {
      const userId = ctx.session.user.id
      await ctx.db
        .delete(drawings)
        .where(and(eq(drawings.id, id), eq(drawings.ownerId, userId)))
    }),

  updateFiles: protectedProcedure
    .input(
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
    .mutation(async ({ ctx, input }) => {
      const { drawingId, files } = input
      await ctx.db
        .delete(drawingFiles)
        .where(eq(drawingFiles.drawingId, drawingId))

      if (files.length > 0) {
        await ctx.db.insert(drawingFiles).values(
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
    }),
})
