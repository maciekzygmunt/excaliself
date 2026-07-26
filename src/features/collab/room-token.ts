/**
 * Token → room, for every guest-reachable surface that isn't the share page:
 * the websocket upgrade and the room-scoped image endpoints (spec §2.4, §4.1).
 *
 * Both surfaces owe the visitor the same three checks — the token resolves,
 * the audience admits them, the drawing isn't trashed — and "the same way the
 * websocket does" is only true if it is literally the same call. The decision
 * itself stays in `resolveRoomJoin`, which is pure; this is the pair of
 * lookups it needs.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { resolveShareForRoom } from "@/features/shares/store"
import { auth } from "@/lib/auth"
import { type RoomJoin, resolveRoomJoin } from "./join"

export async function resolveRoomForToken(
  db: NodePgDatabase<typeof schema>,
  token: string,
  headers: Headers,
): Promise<RoomJoin> {
  const [share, session] = await Promise.all([
    token ? resolveShareForRoom(db, token) : null,
    auth.api.getSession({ headers }),
  ])
  return resolveRoomJoin({ share, user: session?.user ?? null })
}
