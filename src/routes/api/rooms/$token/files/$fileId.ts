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
import { socketIpOf } from "@/lib/client-ip"

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
 * The token is the room's dial string here too — same path segment, same row.
 *
 * Deliberately *not* spending the token-validation budget the share page and
 * the websocket upgrade share (spec §4.5, limiter 1). A late joiner
 * legitimately makes one request per image on the canvas, so any budget small
 * enough to blunt abuse would break the feature it guards — and spending a
 * visitor's 60/min on their own images would then refuse their reconnect.
 * §4.5 names the upload limiter as this surface's only one, and leaves the
 * read side to the 256-bit token.
 */
async function resolveRoom(request: Request, token: string) {
  const join = await resolveRoomForToken(db, token, request.headers)
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

  const file = await loadRoomFile(db, roomId, params.fileId)
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

/**
 * Reads the body with a hard ceiling on the bytes taken in, rather than
 * trusting `content-length` — that header is optional, and a chunked upload
 * omits it entirely. Without this, a token holder could stream an unbounded
 * body straight into memory and the per-image cap would never get to rule on
 * it, because the cap can only read a body that has already been buffered.
 *
 * Decoded as it arrives so the bytes are never held twice.
 */
const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function readCappedBody(
  request: Request,
  maxBytes: number,
): Promise<{ status: "ok"; text: string } | { status: "too-large" | "empty" }> {
  const stream = request.body
  if (!stream) return { status: "empty" }

  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let text = ""
  let total = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      // Hangs up on the sender rather than draining what is left of it.
      if (total > maxBytes) return { status: "too-large" }
      text += decoder.decode(value, { stream: true })
    }
  } catch {
    return { status: "empty" }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return { status: "ok", text: text + decoder.decode() }
}

export async function postRoomFile({
  request,
  params,
}: {
  request: Request
  params: { token: string; fileId: string }
}): Promise<Response> {
  // Cheapest refusal first: a body that *declares* it can't hold a legal image
  // is over the cap whatever it turns out to contain, so it is refused before
  // the token is even looked up. The stream is capped again below, for the
  // senders that declare nothing.
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

  const read = await readCappedBody(request, MAX_UPLOAD_BODY_BYTES)
  if (read.status === "too-large")
    return new Response("Payload Too Large", { status: 413 })

  // Unparseable is just another malformed body — `parseFileUpload` turns the
  // resulting null into the 400 below.
  const body = read.status === "ok" ? parseJson(read.text) : null
  const parsed = parseFileUpload(params.fileId, body)
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
      POST: postRoomFile,
    },
  },
})
