"use server"

import { createServerFn } from "@tanstack/react-start"
import { and, eq, isNull } from "drizzle-orm"
import { z } from "zod"
import { db } from "@/db"
import { drawings } from "@/db/schema"
import { rooms } from "@/features/collab/room-registry"
import { moveRoomToTeam } from "@/features/collab/room-session"
import { authMiddleware } from "@/middleware/auth"
import { listsChangedMiddleware } from "@/middleware/lists-changed"
import { accessibleTo } from "./access"
import { moveToTeam as moveToTeamEngine } from "./move-to-team"

/**
 * Private → Team, the only cross-space move. The client flushes its autosave
 * first; afterwards every tab of a moved drawing joins its Room by id.
 */
export const moveToTeam = createServerFn({ method: "POST" })
  .middleware([authMiddleware, listsChangedMiddleware])
  .validator(
    z.object({
      item: z.object({ type: z.enum(["drawing", "folder"]), id: z.string() }),
      folderId: z.string().nullable(),
    }),
  )
  .handler(async ({ data, context }) => {
    const drawingIds = await moveToTeamEngine(
      db,
      context.session.user.id,
      data.item,
      data.folderId,
    )
    // Live Rooms keep their seats; members who came in by a members link
    // can now open the drawing as Team anyway.
    await Promise.all(drawingIds.map((id) => moveRoomToTeam(rooms, id)))
    return drawingIds
  })

/**
 * Whether the caller can open this drawing as Team. A members-link page asks
 * when its link dies, so it can rejoin by id after a move to Team.
 */
export const isOpenAsTeam = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .validator(z.string())
  .handler(async ({ data: id, context }) => {
    const [drawing] = await db
      .select({ id: drawings.id })
      .from(drawings)
      .where(
        and(
          eq(drawings.id, id),
          accessibleTo(drawings, context.session.user.id),
          eq(drawings.space, "team"),
          isNull(drawings.deletedAt),
        ),
      )
    return drawing !== undefined
  })
