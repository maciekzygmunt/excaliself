/**
 * Payloads and caps of the room image endpoint, shared by server and client so
 * they agree on "too large" and "well formed".
 */

/** Measured on decoded bytes, not base64, so "a 2 MB photo" fits. */
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024

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
// Maps every byte to one char, and only ASCII bytes to ASCII chars.
const latin1 = new TextDecoder("latin1")

/** An ASCII hex digit's value, else -1. */
function hexValue(char: number | undefined): number {
  if (char === undefined) return -1
  if (char >= 0x30 && char <= 0x39) return char - 0x30
  const lower = char | 0x20
  return lower >= 0x61 && lower <= 0x66 ? lower - 0x57 : -1
}

/**
 * `%XX` escapes as bytes, everything else as UTF-8. One pass into one buffer:
 * an upload can be millions of escapes.
 */
function percentDecode(text: string): Uint8Array {
  const input = utf8.encode(text)
  const bytes = new Uint8Array(input.length)
  let length = 0
  for (let i = 0; i < input.length; i++) {
    const high = input[i] === 0x25 ? hexValue(input[i + 1]) : -1
    const low = high < 0 ? -1 : hexValue(input[i + 2])
    if (low < 0) {
      bytes[length++] = input[i]
      continue
    }
    bytes[length++] = high * 16 + low
    i += 2
  }
  return bytes.subarray(0, length)
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
  const base64 = latin1
    .decode(percentDecode(payload))
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
