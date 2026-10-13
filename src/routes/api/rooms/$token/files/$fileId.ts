// Room image bytes go over HTTP, not the socket: the row exists before the
// element syncs as `saved`, so peers always find bytes here.

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

// One refusal for every reason, so it never leaks whether the drawing exists.
const unauthorized = () =>
  new Response("Unauthorized", {
    status: 401,
    headers: { "cache-control": "no-store" },
  })

// No token-validation budget here: a late joiner fetches one image each, which
// would starve their reconnect. Reads rely on the 256-bit token alone.
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
  if (!file) return new Response("Not Found", { status: 404 })

  return Response.json(file, {
    // `fileId` is a content hash, but the blob is room-scoped: private only.
    headers: { "cache-control": "private, max-age=31536000, immutable" },
  })
}

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

// Caps the bytes read; `content-length` is optional, so a chunked body could
// otherwise stream unbounded into memory.
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
  // Cheapest refusal first; the stream is capped again for undeclared bodies.
  const declaredLength = Number(request.headers.get("content-length") ?? "")
  if (Number.isFinite(declaredLength) && declaredLength > MAX_UPLOAD_BODY_BYTES)
    return new Response("Payload Too Large", { status: 413 })

  const roomId = await resolveRoom(request, params.token)
  if (!roomId) return unauthorized()

  // The budget is per IP per room, so it needs the resolved room.
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
