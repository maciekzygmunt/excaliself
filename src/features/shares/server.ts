"use server"

import { createServerFn } from "@tanstack/react-start"
import {
  getRequestHeaders,
  getRequestIP,
  setResponseStatus,
} from "@tanstack/react-start/server"
import { z } from "zod"
import { db } from "@/db"
import { rooms } from "@/features/collab/room-registry"
import { auth } from "@/lib/auth"
import { authMiddleware } from "@/middleware/auth"
// Namespaced because the three server functions below carry the same domain
// verbs — which is the point: this is that operation, with what it owes the
// running Room attached.
import * as lifecycle from "./lifecycle"
import {
  createShareLink,
  getShareLink,
  resolveShareVisit,
  type ShareResolution,
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

// The three mutations that act on a *live* link go through `lifecycle.ts`,
// which pairs each database write with what it owes the running Room — the
// final flush and the evictions of spec §4.2. Each one only answers its
// client once that has happened, so the owner's tab never resumes classic
// autosave while the Room is still writing (spec §5.5).

export const stopSharing = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: drawingId, context }) => {
    await lifecycle.stopSharing(db, rooms, context.session.user.id, drawingId)
  })

export const regenerateShare = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: drawingId, context }) =>
    lifecycle.regenerateShare(db, rooms, context.session.user.id, drawingId),
  )

export const setShareAudience = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ drawingId: z.string(), audience: audienceSchema }))
  .handler(async ({ data, context }) =>
    lifecycle.setShareAudience(
      db,
      rooms,
      context.session.user.id,
      data.drawingId,
      data.audience,
    ),
  )

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
