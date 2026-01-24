import { randomUUID } from "node:crypto"
import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"
import { folders } from "@/lib/db/schema"
import { protectedProcedure, router } from "../init"

export const foldersRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id
    return ctx.db
      .select()
      .from(folders)
      .where(eq(folders.ownerId, userId))
      .orderBy(asc(folders.name))
  }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        parentId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const id = randomUUID()
      const now = new Date()

      await ctx.db.insert(folders).values({
        id,
        name: input.name,
        ownerId: userId,
        parentId: input.parentId ?? null,
        createdAt: now,
        updatedAt: now,
      })

      return {
        id,
        name: input.name,
        ownerId: userId,
        parentId: input.parentId ?? null,
        createdAt: now,
        updatedAt: now,
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        parentId: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id
      const { id, ...updateData } = input
      const cleanedUpdateData = Object.fromEntries(
        Object.entries(updateData).filter(([, value]) => value !== undefined),
      )

      await ctx.db
        .update(folders)
        .set({ ...cleanedUpdateData, updatedAt: new Date() })
        .where(and(eq(folders.id, id), eq(folders.ownerId, userId)))
    }),

  delete: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: folderId }) => {
      const userId = ctx.session.user.id
      await ctx.db
        .delete(folders)
        .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)))
    }),
})
