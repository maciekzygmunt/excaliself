// Share-link persistence, kept out of server.ts so tests can use a fake db.

import { randomBytes, randomUUID } from "node:crypto"
import { and, eq, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import type * as schema from "@/db/schema"
import { drawingFiles, drawings, shares } from "@/db/schema"
import { bytesToDataUrl } from "@/features/drawings/file-bytes"
import { resolveShareAccess, type ShareAudience } from "./access"

type Db = NodePgDatabase<typeof schema>

/** 256-bit hex token. */
export function mintShareToken() {
  return randomBytes(32).toString("hex")
}

// Throws the same "not found" as a missing id, so non-owners can't probe.
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
  // Return an existing link unchanged: only setShareLinkAudience evicts guests.
  return created ?? getShareLink(db, userId, drawingId)
}

export async function stopSharingDrawing(
  db: Db,
  userId: string,
  drawingId: string,
) {
  await requireOwnedLiveDrawing(db, userId, drawingId)
  await db.delete(shares).where(eq(shares.drawingId, drawingId))
}

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

/** Raw token lookup; resolveShareAccess decides whether it grants access. */
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

/** Lean lookup for the ws upgrade (runs on every reconnect): no scene JSON. */
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
  | { status: "dead" }
  | { status: "signin"; drawingName: string }
  | {
      status: "ok"
      audience: ShareAudience
      drawing: { id: string; name: string; data: string }
      files: { fileId: string; mimeType: string; dataUrl: string }[]
    }

/** Resolves a /share/$token visit. "dead" never hints the token existed. */
export async function resolveShareVisit(
  db: Db,
  token: string,
  hasSession: () => Promise<boolean>,
): Promise<ShareResolution> {
  const resolved = await resolveShareByToken(db, token)

  const access = resolveShareAccess({
    share: resolved,
    hasSession: resolved?.audience === "members" ? await hasSession() : false,
  })

  if (access === "dead" || !resolved) return { status: "dead" }
  if (access === "signin")
    return { status: "signin", drawingName: resolved.drawing.name }

  const files = await db
    .select({
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      bytes: drawingFiles.bytes,
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
    files: files.map(({ bytes, ...file }) => ({
      ...file,
      dataUrl: bytesToDataUrl(file.mimeType, bytes),
    })),
  }
}
