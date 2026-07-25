"use server"

import { randomBytes, randomUUID } from "node:crypto"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawingFiles, drawings, shares } from "@/db/schema"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"

export type ShareAudience = "members" | "anyone"

const audienceSchema = z.enum(["members", "anyone"])

const newToken = () => randomBytes(32).toString("hex")

/**
 * Owner check for share mutations. Missing, foreign, and trashed drawings are
 * all "not found" — indistinguishable on purpose, matching the drawings
 * convention so non-owners can't probe.
 */
const ownedLiveDrawing = async (drawingId: string, userId: string) => {
  const [drawing] = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(
      and(
        eq(drawings.id, drawingId),
        eq(drawings.ownerId, userId),
        isNull(drawings.deletedAt),
      ),
    )
  if (!drawing) throw new Error("Drawing not found")
}

export const getShareForDrawing = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    const [share] = await db
      .select({ token: shares.token, audience: shares.audience })
      .from(shares)
      .innerJoin(drawings, eq(shares.drawingId, drawings.id))
      .where(
        and(
          eq(shares.drawingId, drawingId),
          eq(drawings.ownerId, context.session.user.id),
        ),
      )
    return share ?? null
  })

export const createShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) => {
    await ownedLiveDrawing(data.drawingId, context.session.user.id)
    const token = newToken()
    // The unique drawingId index makes double-create a conflict; if another
    // tab won the race, surface its existing link instead of erroring.
    const [created] = await db
      .insert(shares)
      .values({
        id: randomUUID(),
        token,
        drawingId: data.drawingId,
        audience: data.audience,
        createdAt: new Date(),
      })
      .onConflictDoNothing({ target: shares.drawingId })
      .returning({ token: shares.token, audience: shares.audience })
    if (created) return created
    const [existing] = await db
      .select({ token: shares.token, audience: shares.audience })
      .from(shares)
      .where(eq(shares.drawingId, data.drawingId))
    if (!existing) throw new Error("Drawing not found")
    return existing
  })

export const stopSharing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    // No deletedAt filter: stopping must also work from non-canvas surfaces
    // even if the drawing was trashed meanwhile (the row survives trash so
    // restore can revive the link, but the owner may still kill it).
    const [drawing] = await db
      .select({ id: drawings.id })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, drawingId),
          eq(drawings.ownerId, context.session.user.id),
        ),
      )
    if (!drawing) throw new Error("Drawing not found")
    await db.delete(shares).where(eq(shares.drawingId, drawingId))
  })

export const regenerateShareToken = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    await ownedLiveDrawing(drawingId, context.session.user.id)
    const [updated] = await db
      .update(shares)
      .set({ token: newToken() })
      .where(eq(shares.drawingId, drawingId))
      .returning({ token: shares.token, audience: shares.audience })
    if (!updated) throw new Error("Drawing is not shared")
    return updated
  })

export const setShareAudience = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) => {
    await ownedLiveDrawing(data.drawingId, context.session.user.id)
    const [updated] = await db
      .update(shares)
      .set({ audience: data.audience })
      .where(eq(shares.drawingId, data.drawingId))
      .returning({ token: shares.token, audience: shares.audience })
    if (!updated) throw new Error("Drawing is not shared")
    return updated
  })

export type ShareTokenResult =
  | { state: "dead" }
  | { state: "signin"; drawingName: string }
  | {
      state: "ok"
      drawing: { id: string; name: string; data: string }
      files: { fileId: string; mimeType: string; dataUrl: string }[]
    }

/**
 * Public (pre-auth) validation of a share token, re-checked at request time
 * (spec §4.1): token exists, drawing not trashed, audience satisfied. Every
 * dead cause collapses into one "dead" result so nothing leaks about whether
 * a drawing exists.
 */
export const validateShareToken = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(async ({ data: token }): Promise<ShareTokenResult> => {
    const [row] = await db
      .select({
        audience: shares.audience,
        id: drawings.id,
        name: drawings.name,
        data: drawings.data,
      })
      .from(shares)
      .innerJoin(drawings, eq(shares.drawingId, drawings.id))
      .where(and(eq(shares.token, token), isNull(drawings.deletedAt)))
    if (!row) return { state: "dead" }

    if (row.audience === "members") {
      const session = await auth.api.getSession({
        headers: getRequestHeaders(),
      })
      if (!session) return { state: "signin", drawingName: row.name }
    }

    const files = await db
      .select({
        fileId: drawingFiles.fileId,
        mimeType: drawingFiles.mimeType,
        dataUrl: drawingFiles.dataUrl,
      })
      .from(drawingFiles)
      .where(eq(drawingFiles.drawingId, row.id))

    return {
      state: "ok",
      drawing: { id: row.id, name: row.name, data: row.data },
      files,
    }
  })
