"use server"

import { createServerFn } from "@tanstack/react-start"
import { authMiddleware } from "@/middleware/auth"
import { liveDrawingsForOwner } from "./live"
import { rooms } from "./room-registry"

/** Which of my drawings has someone else in it. No args: the session is the query. */
export const getLiveDrawings = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) =>
    liveDrawingsForOwner(rooms, context.session.user.id),
  )
