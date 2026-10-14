"use server"

import { createServerFn } from "@tanstack/react-start"
import { authMiddleware } from "@/middleware/auth"
import { liveDrawingsFor } from "./live"
import { rooms } from "./room-registry"

/** Which drawings I can access have someone else in them. No args: the session is the query. */
export const getLiveDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    liveDrawingsFor(rooms, context.session.user.id),
  )
