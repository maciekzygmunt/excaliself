// Share-link persistence (canvas sharing spec §3, §4.2). Kept out of
// server.ts — which imports the live db — so tests can drive it with a fake
// db, mirroring trash/destroy.ts.

import { randomBytes, randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles, drawings, shares } from "@/db/schema"
import { resolveShareAccess, type ShareAudience } from "./access"

type Db = NodePgDatabase<typeof schema>

/** 256-bit hex, same mint as invites and password resets. */
export function mintShareToken() {
  return randomBytes(32).toString("hex")
}

/**
 * Ownership gate for every mutation: throws the same "not found" a
 * nonexistent id would, so non-owners can't tell the drawing exists.
 * Trashed drawings are refused like every other write path — their link is
 * dead anyway (§4.3), and managing it resumes on restore.
 */
async function requireOwnedLiveDrawing(
  db: Db,
  userId: string,
  drawingId: string,
) {
  const [drawing] = await db
    .select({ id: drawings.id })
    .from(drawings)
    .where(
      and(
        eq(drawings.id, drawingId),
        eq(drawings.ownerId, userId),
        isNull(drawings.deletedAt),
      ),
    )
  if (!drawing) throw new Error("Drawing not found")
}

const shareColumns = {
  token: shares.token,
  audience: shares.audience,
  createdAt: shares.createdAt,
}

/** The owner's live link for a drawing, or null when unshared. */
export async function getShareLink(db: Db, userId: string, drawingId: string) {
  const [share] = await db
    .select(shareColumns)
    .from(shares)
    .innerJoin(drawings, eq(shares.drawingId, drawings.id))
    .where(and(eq(shares.drawingId, drawingId), eq(drawings.ownerId, userId)))
  return share ?? null
}

export async function createShareLink(
  db: Db,
  userId: string,
  drawingId: string,
  audience: ShareAudience,
) {
  await requireOwnedLiveDrawing(db, userId, drawingId)
  const [created] = await db
    .insert(shares)
    .values({
      id: randomUUID(),
      token: mintShareToken(),
      drawingId,
      audience,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: shares.drawingId })
    .returning(shareColumns)
  // A link already exists (a stale dialog, or a race): return it unchanged.
  // Only setShareLinkAudience may tighten it, because only it evicts guests.
  return created ?? getShareLink(db, userId, drawingId)
}

/** Deletes the link. Idempotent: stopping an unshared drawing is a no-op. */
export async function stopSharingDrawing(
  db: Db,
  userId: string,
  drawingId: string,
) {
  await requireOwnedLiveDrawing(db, userId, drawingId)
  await db.delete(shares).where(eq(shares.drawingId, drawingId))
}

/** Replaces the token on the existing row — audience kept, old URL dead. */
export async function regenerateShareLink(
  db: Db,
  userId: string,
  drawingId: string,
) {
  await requireOwnedLiveDrawing(db, userId, drawingId)
  const updated = await db
    .update(shares)
    .set({ token: mintShareToken() })
    .where(eq(shares.drawingId, drawingId))
    .returning(shareColumns)
  if (updated.length === 0) throw new Error("Share not found")
  return updated[0]
}

export async function setShareLinkAudience(
  db: Db,
  userId: string,
  drawingId: string,
  audience: ShareAudience,
) {
  await requireOwnedLiveDrawing(db, userId, drawingId)
  const updated = await db
    .update(shares)
    .set({ audience })
    .where(eq(shares.drawingId, drawingId))
    .returning(shareColumns)
  if (updated.length === 0) throw new Error("Share not found")
  return updated[0]
}

/**
 * Token → share + drawing, for /share/$token (and later the ws upgrade).
 * Returns whatever the token resolves to — deciding whether that grants
 * access is resolveShareAccess's job, deletedAt check included.
 */
export async function resolveShareByToken(db: Db, token: string) {
  const [row] = await db
    .select({
      audience: shares.audience,
      drawing: {
        id: drawings.id,
        name: drawings.name,
        data: drawings.data,
        deletedAt: drawings.deletedAt,
      },
    })
    .from(shares)
    .innerJoin(drawings, eq(shares.drawingId, drawings.id))
    .where(eq(shares.token, token))
  return row ?? null
}

/**
 * Token → the bare minimum the websocket upgrade needs: the audience to
 * check, the drawing's id (which is the room), and whether it is trashed.
 * Deliberately not `resolveShareByToken` — that carries the whole scene JSON,
 * and an upgrade runs on every (re)connect.
 */
export async function resolveShareForRoom(db: Db, token: string) {
  const [row] = await db
    .select({
      audience: shares.audience,
      drawing: { id: drawings.id, deletedAt: drawings.deletedAt },
    })
    .from(shares)
    .innerJoin(drawings, eq(shares.drawingId, drawings.id))
    .where(eq(shares.token, token))
  return row ?? null
}

export type ShareResolution =
  /** Every dead token — unknown, stopped, regenerated-away, trashed. */
  | { status: "dead" }
  /** Valid members-only link, no session. Name feeds the sign-in gate. */
  | { status: "signin"; drawingName: string }
  | {
      status: "ok"
      audience: ShareAudience
      drawing: { id: string; name: string; data: string }
      files: { fileId: string; mimeType: string; dataUrl: string }[]
    }

/**
 * What a visit to /share/$token gets, resolved fresh so stop, regenerate,
 * and trash take effect at request time (spec §4.1). The session check is
 * injected (and only consulted for members-only links) so the full outcome
 * matrix stays drivable by tests. The dead arm carries nothing — no
 * drawing, no hint whether the token ever existed.
 */
export async function resolveShareVisit(
  db: Db,
  token: string,
  hasSession: () => Promise<boolean>,
): Promise<ShareResolution> {
  const resolved = await resolveShareByToken(db, token)

  const access = resolveShareAccess({
    share: resolved,
    drawing: resolved?.drawing ?? null,
    hasSession: resolved?.audience === "members" ? await hasSession() : false,
  })

  if (access === "dead" || !resolved) return { status: "dead" }
  if (access === "signin")
    return { status: "signin", drawingName: resolved.drawing.name }

  const files = await db
    .select({
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      dataUrl: drawingFiles.dataUrl,
    })
    .from(drawingFiles)
    .where(eq(drawingFiles.drawingId, resolved.drawing.id))

  return {
    status: "ok",
    audience: resolved.audience,
    drawing: {
      id: resolved.drawing.id,
      name: resolved.drawing.name,
      data: resolved.drawing.data,
    },
    files,
  }
}
