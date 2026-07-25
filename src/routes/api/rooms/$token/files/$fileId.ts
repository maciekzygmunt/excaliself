/**
 * The room-scoped image endpoint (canvas sharing spec §2.4, §5.4). Image
 * bytes never travel on the socket: the uploader POSTs a blob here and the
 * row is written immediately, so by the time the element flips to
 * `status: "saved"` and syncs as a normal delta, every peer that reacts to it
 * finds bytes waiting on the GET.
 *
 * Deliberately thin, like the websocket route it mirrors: both methods
 * validate the token, the audience, and `deletedAt` through the same
 * `resolveRoomForToken` the upgrade uses, and everything else lives in
 * `@/features/collab`, where it is tested without a server.
 */

import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { loadRoomFile, saveRoomFile } from "@/features/collab/room-file-store"
import {
  MAX_UPLOAD_BODY_BYTES,
  parseFileUpload,
} from "@/features/collab/room-files"
import { resolveRoomForToken } from "@/features/collab/room-token"
import { allowImageUpload } from "@/features/collab/upload-rate-limit"

/**
 * One generic refusal for every reason, exactly as the upgrade and the
 * dead-link page do it: a rejected request never reveals whether the drawing
 * exists, whether the token was ever valid, or whether it needs a session.
 */
const unauthorized = () =>
  new Response("Unauthorized", {
    status: 401,
    headers: { "cache-control": "no-store" },
  })

/**
 * srvx exposes the peer address on the request in the built server; the vite
 * dev server does not, and `clientIpKey` falls back to headers there.
 */
const socketIpOf = (request: Request) =>
  (request as Request & { ip?: string }).ip ?? null

/** The token is the room's dial string here too — same path segment, same row. */
async function resolveRoom(request: Request, token: string) {
  const join = await resolveRoomForToken(
    db,
    decodeURIComponent(token),
    request.headers,
  )
  return join.status === "ok" ? join.roomId : null
}

export async function getRoomFile({
  request,
  params,
}: {
  request: Request
  params: { token: string; fileId: string }
}): Promise<Response> {
  const roomId = await resolveRoom(request, params.token)
  if (!roomId) return unauthorized()

  const file = await loadRoomFile(db, roomId, decodeURIComponent(params.fileId))
  // A peer only fetches ids it has seen on a `saved` image, so a miss here is
  // a genuine 404 rather than the pending case — and it stays a 404 rather
  // than an empty body, so the client can tell "not there" from "no bytes".
  if (!file) return new Response("Not Found", { status: 404 })

  return Response.json(file, {
    // Blobs are immutable — `fileId` is their content hash — but they are
    // also room-scoped, so this is a private cache only.
    headers: { "cache-control": "private, max-age=31536000, immutable" },
  })
}

export async function putRoomFile({
  request,
  params,
}: {
  request: Request
  params: { token: string; fileId: string }
}): Promise<Response> {
  // Cheapest refusal first: a body that can't possibly hold a legal image is
  // over the cap whatever it turns out to contain, and reading it would be
  // paying for the attack. A missing content-length falls through to the
  // exact check below.
  const declaredLength = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BODY_BYTES)
    return new Response("Payload Too Large", { status: 413 })

  const roomId = await resolveRoom(request, params.token)
  if (!roomId) return unauthorized()

  // Spent after the room is known, because the budget is per IP *per room*
  // (spec §4.5) — there is no key to count against until the token resolves.
  if (
    !allowImageUpload({
      headers: request.headers,
      socketIp: socketIpOf(request),
      roomId,
    })
  )
    return new Response("Too Many Requests", { status: 429 })

  const body = await request.json().catch(() => null)
  const parsed = parseFileUpload(decodeURIComponent(params.fileId), body)
  if (parsed.status === "too-large")
    return new Response("Payload Too Large", { status: 413 })
  if (parsed.status === "invalid")
    return new Response("Bad Request", { status: 400 })

  await saveRoomFile(db, roomId, parsed.file)
  return new Response(null, { status: 204 })
}

export const Route = createFileRoute("/api/rooms/$token/files/$fileId")({
  server: {
    handlers: {
      GET: getRoomFile,
      POST: putRoomFile,
    },
  },
})
