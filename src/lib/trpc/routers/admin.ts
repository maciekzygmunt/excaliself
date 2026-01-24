import { randomBytes, randomUUID } from "node:crypto"
import { TRPCError } from "@trpc/server"
import { and, count, eq, gt, inArray, isNull } from "drizzle-orm"
import { z } from "zod"
import {
  accounts,
  drawingFiles,
  drawings,
  folders,
  invites,
  sessions,
  users,
  verifications,
} from "@/lib/db/schema"
import { protectedProcedure, publicProcedure, router } from "../init"

export const adminRouter = router({
  getUserCount: publicProcedure.query(async ({ ctx }) => {
    const result = await ctx.db.select({ count: count() }).from(users)
    return result[0].count
  }),

  getAllUsers: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(users)
  }),

  deleteUser: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: userId }) => {
      const currentUser = ctx.session.user
      if (currentUser.id === userId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete yourself",
        })
      }

      ctx.db.transaction((tx) => {
        const user = tx
          .select({ email: users.email })
          .from(users)
          .where(eq(users.id, userId))
          .get()

        if (!user) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
        }

        const userDrawings = tx
          .select({ id: drawings.id })
          .from(drawings)
          .where(eq(drawings.ownerId, userId))
          .all()
        const drawingIds = userDrawings.map((d) => d.id)

        if (drawingIds.length > 0) {
          tx.delete(drawingFiles)
            .where(inArray(drawingFiles.drawingId, drawingIds))
            .run()
        }

        tx.delete(drawings).where(eq(drawings.ownerId, userId)).run()
        tx.delete(folders).where(eq(folders.ownerId, userId)).run()
        tx.delete(sessions).where(eq(sessions.userId, userId)).run()
        tx.delete(accounts).where(eq(accounts.userId, userId)).run()
        tx.delete(invites).where(eq(invites.invitedBy, userId)).run()
        tx.update(invites)
          .set({ usedBy: null })
          .where(eq(invites.usedBy, userId))
          .run()
        tx.delete(verifications)
          .where(eq(verifications.identifier, user.email))
          .run()
        tx.delete(users).where(eq(users.id, userId)).run()
      })
    }),

  getPendingInvites: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(invites)
      .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date())))
  }),

  createInvite: protectedProcedure.mutation(async ({ ctx }) => {
    const id = randomUUID()
    const token = randomBytes(32).toString("hex")
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const adminId = ctx.session.user.id

    await ctx.db.insert(invites).values({
      id,
      token,
      invitedBy: adminId,
      expiresAt,
      createdAt: new Date(),
    })

    return { id, token }
  }),

  deleteInvite: protectedProcedure
    .input(z.string())
    .mutation(async ({ ctx, input: id }) => {
      await ctx.db.delete(invites).where(eq(invites.id, id))
    }),

  // Combined query for admin page - fetches both users and invites
  getAdminData: protectedProcedure.query(async ({ ctx }) => {
    const [usersList, invitesList] = await Promise.all([
      ctx.db.select().from(users),
      ctx.db
        .select()
        .from(invites)
        .where(and(isNull(invites.usedAt), gt(invites.expiresAt, new Date()))),
    ])
    return { users: usersList, invites: invitesList }
  }),
})
