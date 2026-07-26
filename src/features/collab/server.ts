"use server"

import { createServerFn } from "@tanstack/react-start"
import { authMiddleware } from "@/middleware/auth"
import { liveDrawingsForOwner } from "./live"
import { rooms } from "./room-registry"

/**
 * The live badge's poll (canvas sharing spec §1.5): which of my drawings has
 * someone else in it right now.
 *
 * Argument-less on purpose — the caller's session is the whole query, so
 * there is nothing to validate and nothing a client can ask about that isn't
 * already its own. A Map scan over the live Rooms with no database reads, so
 * it needs no rate limiter of its own beyond the auth check.
 */
export const getLiveDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    liveDrawingsForOwner(rooms, context.session.user.id),
  )
