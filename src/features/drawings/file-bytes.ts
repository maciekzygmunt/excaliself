// drawing_files stores raw bytes; clients get them back as base64 data URLs.
// Server-only: Buffer has no browser counterpart.

import { readDataUrl } from "@/features/collab/room-files"

/** Expects a data URL `parseFileUpload` has already accepted. */
export function dataUrlToBytes(dataUrl: string): Buffer {
  const decoded = readDataUrl(dataUrl)
  if (!decoded) throw new Error("Not a data URL")
  return "base64" in decoded
    ? Buffer.from(decoded.base64, "base64")
    : Buffer.from(decoded.bytes)
}

export function bytesToDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`
}
