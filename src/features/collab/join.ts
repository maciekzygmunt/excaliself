/**
 * Who may open a room socket, and as whom (canvas sharing spec §2.1, §4.1).
 *
 * Pure, like the share page's `resolveShareAccess` it delegates to: the
 * websocket route does the two lookups (token row, session) and hands the
 * results here. Every upgrade runs this fresh, so stopping or regenerating a
 * link, tightening its audience, or trashing the drawing kills the next join
 * without any socket-side bookkeeping.
 */

import {
  resolveShareAccess,
  type ShareAudience,
} from "@/features/shares/access"
import { memberDisplayName } from "./identity"
import type { ParticipantIdentity } from "./room-session"

export type SessionUser = {
  id: string
  name?: string | null
  email?: string | null
}

export type RoomJoin =
  | { status: "ok"; roomId: string; identity: ParticipantIdentity }
  /**
   * Every refusal reason collapses to this one value, matching the share
   * page's single dead-link state — a rejected upgrade tells the caller
   * nothing about whether the drawing exists.
   */
  | { status: "refused" }

export function resolveRoomJoin(input: {
  /** The share row the token resolved to, or null for an unknown token. */
  share: {
    audience: ShareAudience
    drawing: { id: string; deletedAt: Date | null }
  } | null
  /** The better-auth session's user, or null for a guest. */
  user: SessionUser | null
}): RoomJoin {
  const { share, user } = input
  const access = resolveShareAccess({
    share,
    drawing: share?.drawing ?? null,
    hasSession: user !== null,
  })
  if (access !== "ok" || !share) return { status: "refused" }

  return {
    status: "ok",
    // The Room is per Drawing, never per token: a regenerated link points at
    // the same room, and a socket cannot pick which room it lands in.
    roomId: share.drawing.id,
    identity: {
      userId: user?.id ?? null,
      displayName: user ? memberDisplayName(user) : null,
    },
  }
}
