"use server"

import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { z } from "zod"
import { db } from "@/db"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"
import {
  createShareLink,
  getShareLink,
  regenerateShareLink,
  resolveShareVisit,
  setShareLinkAudience,
  stopSharingDrawing,
} from "./store"

const audienceSchema = z.enum(["members", "anyone"])

export const getDrawingShare = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) =>
    getShareLink(db, context.session.user.id, drawingId),
  )

export const createShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) =>
    createShareLink(db, context.session.user.id, data.drawingId, data.audience),
  )

export const stopSharing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    await stopSharingDrawing(db, context.session.user.id, drawingId)
  })

export const regenerateShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.string())
  .handler(async ({ data: drawingId, context }) =>
    regenerateShareLink(db, context.session.user.id, drawingId),
  )

export const setShareAudience = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .inputValidator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) =>
    setShareLinkAudience(
      db,
      context.session.user.id,
      data.drawingId,
      data.audience,
    ),
  )

/**
 * Public (pre-auth) resolution of a share token, called by the /share/$token
 * loader on every visit. All decisions live in resolveShareVisit; this
 * wrapper only supplies the live db and the cookie-derived session check.
 */
export const resolveShareToken = createServerFn({ method: "GET" })
  .inputValidator(z.string())
  .handler(({ data: token }) =>
    resolveShareVisit(
      db,
      token,
      async () =>
        (await auth.api.getSession({ headers: getRequestHeaders() })) !== null,
    ),
  )
