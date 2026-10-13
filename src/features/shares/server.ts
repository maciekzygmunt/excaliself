"use server"

import { createServerFn } from "@tanstack/react-start"
import {
  getRequestHeaders,
  getRequestIP,
  setResponseStatus,
} from "@tanstack/react-start/server"
import { z } from "zod"
import { db } from "@/db"
import { endRooms, rooms } from "@/features/collab/room-registry"
import { evictNonMembers } from "@/features/collab/room-session"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"
import { admitsGuests } from "./access"
import {
  createShareLink,
  getShareLink,
  regenerateShareLink,
  resolveShareVisit,
  type ShareResolution,
  setShareLinkAudience,
  stopSharingDrawing,
} from "./store"
import { allowTokenValidation } from "./token-rate-limit"

const audienceSchema = z.enum(["members", "anyone"])

export const getDrawingShare = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: drawingId, context }) =>
    getShareLink(db, context.session.user.id, drawingId),
  )

export const createShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) =>
    createShareLink(db, context.session.user.id, data.drawingId, data.audience),
  )

// Each mutation below writes the row first, then updates the live Room. In
// that order, a socket that joins between the two steps cannot keep its seat.

export const stopSharing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    await stopSharingDrawing(db, context.session.user.id, drawingId)
    await endRooms([drawingId])
  })

export const regenerateShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    const share = await regenerateShareLink(
      db,
      context.session.user.id,
      drawingId,
    )
    await endRooms([drawingId])
    return share
  })

export const setShareAudience = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) => {
    const share = await setShareLinkAudience(
      db,
      context.session.user.id,
      data.drawingId,
      data.audience,
    )
    if (!admitsGuests(share.audience))
      await evictNonMembers(rooms, data.drawingId)
    return share
  })

/**
 * What the /share/$token loader gets back. `throttled` is the limiter's
 * answer and never comes out of resolveShareVisit — it is decided before the
 * database is touched at all.
 */
export type ShareVisit = ShareResolution | { status: "throttled" }

/**
 * Public (pre-auth) resolution of a share token, called by the /share/$token
 * loader on every visit. All decisions live in resolveShareVisit; this
 * wrapper only supplies the live db, the cookie-derived session check, and
 * the per-IP validation limit of spec §4.5.
 */
export const resolveShareToken = createServerFn({ method: "GET" })
  .validator(z.string())
  .handler(async ({ data: token }): Promise<ShareVisit> => {
    const headers = getRequestHeaders()
    // Counted before the token lookup, so a flood costs the database nothing.
    // The real 429 goes on the wire; the loader data drives the page.
    if (!allowTokenValidation({ headers, socketIp: getRequestIP() })) {
      setResponseStatus(429)
      return { status: "throttled" }
    }

    return resolveShareVisit(
      db,
      token,
      async () => (await auth.api.getSession({ headers })) !== null,
    )
  })
