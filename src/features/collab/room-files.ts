/**
 * The payloads and the caps of the room-scoped image endpoint (canvas sharing
 * spec §2.4, §5.4).
 *
 * Image bytes never cross the websocket. The uploader POSTs a data URL to
 * `/api/rooms/<token>/files/<fileId>`, the row is written before the element
 * flips to `status: "saved"`, and peers GET the id they don't have bytes for.
 *
 * Everything here is pure and shared by both ends, so the handler and the
 * client can't drift on what "too large" or "well formed" means.
 */

/**
 * Spec §5.4's per-image cap, measured on the decoded image rather than on the
 * base64 carrying it: 2 MB is what someone means by "a 2 MB photo", and
 * charging them base64's 4/3 overhead would refuse pictures they can see are
 * under the limit.
 */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/**
 * What the handler refuses on `content-length` alone, before reading a byte —
 * the largest legal image once base64 has inflated it, plus room for the
 * `data:<mime>;base64,` prefix and the JSON envelope around it.
 */
export const MAX_UPLOAD_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024

/** A stored blob, as the database holds it. */
export type RoomFile = { fileId: string; mimeType: string; dataUrl: string }

/** What the uploader puts on the wire; the mime type is read out of the URL. */
export type RoomFileUpload = { fileId: string; dataUrl: string }

/** What a GET answers with — one `addFiles()` entry, minus the branding. */
export type RoomFilePayload = RoomFile & { created: number }

/**
 * Excalidraw's `IMAGE_MIME_TYPES`, restated. The constant isn't exported from
 * the package root, and the package is a browser bundle the server must not
 * pull in to read one list — this endpoint is reachable by guests, so what it
 * agrees to store is worth stating in full anyway.
 */
const IMAGE_MIME_TYPES = new Set([
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-icon",
  "image/avif",
  "image/jfif",
])

/** Upstream's `FileId` is a content hash; anything else is not one of ours. */
const FILE_ID = /^[A-Za-z0-9_-]{1,128}$/

/**
 * Excalidraw builds every file's `dataURL` with `FileReader.readAsDataURL`,
 * so base64 is the only form this endpoint has to accept — and the only one
 * whose decoded size can be checked without decoding it.
 */
const BASE64_DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/

/** How many bytes a base64 string decodes to, without decoding it. */
export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
}

export type UploadParse =
  | { status: "ok"; file: RoomFile }
  /** Not an image data URL this endpoint stores — a 400. */
  | { status: "invalid" }
  /** Well formed but over the per-image cap — a 413 (spec §5.4). */
  | { status: "too-large" }

/**
 * Validates one upload. The fileId comes from the path and the bytes from the
 * body; the mime type is read out of the data URL rather than trusted from a
 * separate field, so the two can never disagree about what was stored.
 */
export function parseFileUpload(fileId: string, body: unknown): UploadParse {
  if (!FILE_ID.test(fileId)) return { status: "invalid" }
  if (typeof body !== "object" || body === null) return { status: "invalid" }

  const { dataUrl } = body as { dataUrl?: unknown }
  if (typeof dataUrl !== "string") return { status: "invalid" }

  const match = BASE64_DATA_URL.exec(dataUrl)
  if (!match) return { status: "invalid" }

  const mimeType = match[1].toLowerCase()
  const base64 = match[2]
  if (!IMAGE_MIME_TYPES.has(mimeType)) return { status: "invalid" }
  // A base64 payload is always a whole number of quartets, and an empty one
  // is not an image.
  if (base64.length === 0 || base64.length % 4 !== 0)
    return { status: "invalid" }

  // Size is judged last so a malformed body reads as a 400, never a 413.
  if (base64ByteLength(base64) > MAX_IMAGE_BYTES) return { status: "too-large" }

  return { status: "ok", file: { fileId, mimeType, dataUrl } }
}

/**
 * The client's side of the same contract: a GET body is JSON from the network
 * and gets the same hand-written guard the socket protocol uses, rather than
 * being trusted into `addFiles()`.
 */
export function parseFilePayload(value: unknown): RoomFilePayload | null {
  if (typeof value !== "object" || value === null) return null
  const { fileId, mimeType, dataUrl, created } = value as Record<
    string,
    unknown
  >
  if (typeof fileId !== "string" || !fileId) return null
  if (typeof mimeType !== "string" || !mimeType) return null
  if (typeof dataUrl !== "string" || !dataUrl) return null
  return {
    fileId,
    mimeType,
    dataUrl,
    created:
      typeof created === "number" && Number.isFinite(created) ? created : 0,
  }
}
