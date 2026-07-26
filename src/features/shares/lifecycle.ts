/**
 * Link lifecycle enforced against the running Room (canvas sharing spec §4.2).
 *
 * Killing a link is two writes in two different places: the `shares` row, and
 * the sockets that were let in by the old one. `store.ts` owns the first and
 * `room-session.ts` the second; this is the seam that orders them, and the
 * order is the whole point — the row always goes first.
 *
 * From the moment the row is gone (or its token replaced), every upgrade
 * re-validation refuses, so the sockets closed a beat later cannot be
 * replaced by new ones dialing the same dead link. Doing it the other way
 * around leaves exactly that window open, and a socket that slipped through
 * it would sit in a Room nothing is ever going to close. (Spec §5.5 words the
 * stop-sharing reverse the other way round — "Room flushes → row deleted →
 * sockets close" — which closes a much narrower window instead: the moment
 * between the delete and the flush, in which the classic-write guard of
 * `scene-write.ts` is open. §4.2's order wins because a stuck socket is
 * unrecoverable and that write is not: every tab that could make it is in the
 * Room, so what it writes is a subset of what the Room flushes.)
 *
 * Kept out of `server.ts` — which imports the live db and the process's
 * registry — so the ordering is drivable by tests with a fake db and a
 * registry of fake peers.
 */

import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import type { RoomRegistry } from "@/features/collab/room-session"
import { evictNonMembers, terminateRoom } from "@/features/collab/room-session"
import { admitsGuests, type ShareAudience } from "./access"
import {
  regenerateShareLink,
  setShareLinkAudience,
  stopSharingDrawing,
} from "./store"

type Db = NodePgDatabase<typeof schema>

/**
 * Stop sharing (spec §4.2): the link dies, the Room writes what the session
 * produced, and every socket in it — the owner's own included — is closed.
 * Their clients answer by re-resolving the token: guests land on the
 * dead-link page, and the owner falls back to solo editing with classic
 * autosave, which the deleted row has just re-permitted (spec §5.5).
 *
 * "Written" here is the Room's best effort, not a guarantee: a flush the
 * database refuses is retried on the throttle rather than raised, so on that
 * path the caller resolves while the Room still owes a write (see
 * `terminateRoom`).
 */
export async function stopSharing(
  db: Db,
  registry: RoomRegistry,
  userId: string,
  drawingId: string,
): Promise<void> {
  await stopSharingDrawing(db, userId, drawingId)
  await terminateRoom(registry, drawingId)
}

/**
 * Regenerate (spec §4.2): same termination path as stopping, because from the
 * Room's side it is the same event — every socket was let in by a token that
 * no longer exists. The audience rides along on the row, and the caller gets
 * the new link back to put in front of the owner immediately.
 *
 * The evicted owner tab redials on the new token; a visitor who opened the
 * *new* URL inside the moment between the two writes is closed along with the
 * rest and gets the dead-link page for a link that is in fact live — one
 * reload away, and the alternative ordering leaves a guest on a dead link
 * with nobody left to evict them.
 */
export async function regenerateShare(
  db: Db,
  registry: RoomRegistry,
  userId: string,
  drawingId: string,
) {
  const share = await regenerateShareLink(db, userId, drawingId)
  await terminateRoom(registry, drawingId)
  return share
}

/**
 * Change who the link admits (spec §4.2). Tightening evicts the connections
 * that never authenticated a member and leaves everyone else mid-stroke;
 * loosening evicts nobody, since it only widens who may join next.
 *
 * The check is on the resulting audience rather than on a before/after
 * comparison: an audience that admits no guests means there are none in the
 * Room, and enforcing that outright also mops up a guest left over from an
 * earlier audience — a connection the link may not admit is a connection the
 * link may not admit, however it got there.
 */
export async function setShareAudience(
  db: Db,
  registry: RoomRegistry,
  userId: string,
  drawingId: string,
  audience: ShareAudience,
) {
  const share = await setShareLinkAudience(db, userId, drawingId, audience)
  if (!admitsGuests(share.audience)) await evictNonMembers(registry, drawingId)
  return share
}
