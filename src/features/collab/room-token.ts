/**
 * Token → room, for the websocket and the room-scoped image endpoints. Both
 * run the same checks as the share page (spec §4.1), through this one call.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { resolveShareAccess } from "@/features/shares/access"
import { resolveShareForRoom } from "@/features/shares/store"
import { auth } from "@/lib/auth"
import { memberDisplayName } from "./identity"
import type { ParticipantIdentity } from "./room-session"

export type RoomJoin =
  | { status: "ok"; roomId: string; identity: ParticipantIdentity }
  /** Every refusal reason, so nothing tells whether the drawing exists. */
  | { status: "refused" }

export async function resolveRoomForToken(
  db: NodePgDatabase<typeof schema>,
  token: string,
  headers: Headers,
): Promise<RoomJoin> {
  const [share, session] = await Promise.all([
    token ? resolveShareForRoom(db, token) : null,
    auth.api.getSession({ headers }),
  ])
  const user = session?.user ?? null
  const access = resolveShareAccess({ share, hasSession: user !== null })
  if (access !== "ok" || !share) return { status: "refused" }

  return {
    status: "ok",
    // One Room per drawing, not per token: a regenerated link meets the same room.
    roomId: share.drawing.id,
    identity: {
      userId: user?.id ?? null,
      displayName: user ? memberDisplayName(user) : null,
    },
  }
}
