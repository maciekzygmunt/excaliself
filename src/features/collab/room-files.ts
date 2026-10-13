/**
 * Payloads and caps of the room image endpoint, shared by server and client so
 * they agree on "too large" and "well formed".
 */

/** Measured on decoded bytes, not base64, so "a 2 MB photo" fits. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

/** Refused on `content-length` alone: max image as base64, plus envelope. */
export const MAX_UPLOAD_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024

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

/** Excalidraw always emits base64 (`readAsDataURL`), so that's all we accept. */
const BASE64_DATA_URL = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/

export function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0
  return (base64.length / 4) * 3 - padding
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

  const match = BASE64_DATA_URL.exec(dataUrl)
  if (!match) return { status: "invalid" }

  const mimeType = match[1].toLowerCase()
  const base64 = match[2]
  if (!IMAGE_MIME_TYPES.has(mimeType)) return { status: "invalid" }
  if (base64.length === 0 || base64.length % 4 !== 0)
    return { status: "invalid" }

  // Size is judged last so a malformed body reads as a 400, never a 413.
  if (base64ByteLength(base64) > MAX_IMAGE_BYTES) return { status: "too-large" }

  return { status: "ok", file: { fileId, mimeType, dataUrl } }
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
