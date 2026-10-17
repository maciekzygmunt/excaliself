"use server"

import { createServerFn } from "@tanstack/react-start"
import { authMiddleware } from "@/middleware/auth"
import { liveFor } from "./live"
import { rooms } from "./room-registry"

/** Which drawings I can access have someone else in them. No args: the session is the query. */
export const getLiveDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => liveFor(rooms, context.session.user.id))
