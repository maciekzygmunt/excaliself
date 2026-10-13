/**
 * Payloads and caps of the room image endpoint, shared by server and client so
 * they agree on "too large" and "well formed".
 */

/** Measured on decoded bytes, not base64, so "a 2 MB photo" fits. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/**
 * Stored image bytes per drawing (20 MB). A load sends them all as base64 in
 * one server fn response, which TanStack Start caps at 32 MiB; this is ~27.
 */
export const MAX_DRAWING_IMAGE_BYTES = 10 * MAX_IMAGE_BYTES

/**
 * Refused on `content-length` alone: max image as a percent-encoded data URL
 * (up to 3 chars per byte; base64 is 4/3), plus envelope.
 */
export const MAX_UPLOAD_BODY_BYTES = 3 * MAX_IMAGE_BYTES + 1024

export type RoomFile = { fileId: string; mimeType: string; dataUrl: string }

/** What the uploader puts on the wire; the mime type is read out of the URL. */
export type RoomFileUpload = { fileId: string; dataUrl: string }

/** What a GET answers with — one `addFiles()` entry, minus the branding. */
export type RoomFilePayload = RoomFile & { created: number }

/** Excalidraw's `IMAGE_MIME_TYPES`, restated: the server can't import its browser bundle. */
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

const utf8 = new TextEncoder()

/** `%XX` escapes as bytes, everything else as UTF-8. */
function percentDecode(text: string): Uint8Array {
  // The capture group puts each escape's hex digits at the odd indexes.
  const parts = text
    .split(/%([0-9A-Fa-f]{2})/)
    .map((part, i) =>
      i % 2 ? Uint8Array.of(Number.parseInt(part, 16)) : utf8.encode(part),
    )
  const bytes = new Uint8Array(
    parts.reduce((sum, part) => sum + part.length, 0),
  )
  let offset = 0
  for (const part of parts) {
    bytes.set(part, offset)
    offset += part.length
  }
  return bytes
}

/** `base64` is unpadded and free of whitespace. */
export type DataUrlBody = { mimeType: string } & (
  | { base64: string }
  | { bytes: Uint8Array }
)

/**
 * Reads a data URL as a browser does (and as migration 0008 backfilled):
 * percent-escapes first, then base64 only if the last header param says so.
 * Excalidraw emits base64, but an imported file can keep a URL-encoded SVG.
 */
export function readDataUrl(dataUrl: string): DataUrlBody | null {
  const comma = dataUrl.indexOf(",")
  if (!dataUrl.startsWith("data:") || comma < 0) return null
  const header = dataUrl.slice("data:".length, comma).split(";")
  const mimeType = header[0].trim().toLowerCase()
  const payload = dataUrl.slice(comma + 1)
  if (header.at(-1)?.trim().toLowerCase() !== "base64")
    return { mimeType, bytes: percentDecode(payload) }

  // Escaped non-ASCII chars fail the alphabet check, as they should.
  const base64 = payload
    .replace(/%([0-9A-Fa-f]{2})/g, (_, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/[\t\n\f\r ]/g, "")
    .replace(/={1,2}$/, "")
  if (!/^[A-Za-z0-9+/]*$/.test(base64) || base64.length % 4 === 1) return null
  return { mimeType, base64 }
}

export type UploadParse =
  | { status: "ok"; file: RoomFile }
  /** 400 */
  | { status: "invalid" }
  /** 413 */
  | { status: "too-large" }

/** The mime type comes from the data URL itself, so it can't disagree with the bytes. */
export function parseFileUpload(fileId: string, body: unknown): UploadParse {
  if (!FILE_ID.test(fileId)) return { status: "invalid" }
  if (typeof body !== "object" || body === null) return { status: "invalid" }

  const { dataUrl } = body as { dataUrl?: unknown }
  if (typeof dataUrl !== "string") return { status: "invalid" }

  const decoded = readDataUrl(dataUrl)
  if (!decoded || !IMAGE_MIME_TYPES.has(decoded.mimeType))
    return { status: "invalid" }

  // Base64 is measured, not decoded: this runs on every solo canvas change.
  const byteLength =
    "base64" in decoded
      ? Math.floor((decoded.base64.length * 3) / 4)
      : decoded.bytes.length
  if (byteLength === 0) return { status: "invalid" }

  // Size is judged last so a malformed body reads as a 400, never a 413.
  if (byteLength > MAX_IMAGE_BYTES) return { status: "too-large" }

  return {
    status: "ok",
    file: { fileId, mimeType: decoded.mimeType, dataUrl },
  }
}

/** Guards a GET body before it reaches `addFiles()`. */
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
