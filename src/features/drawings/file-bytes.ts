// drawing_files stores raw bytes; clients speak Excalidraw's base64 data URLs.
// Server-only: Buffer has no browser counterpart.

/** Expects a data URL `parseFileUpload` has already accepted. */
export function dataUrlToBytes(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64")
}

export function bytesToDataUrl(mimeType: string, bytes: Buffer): string {
  return `data:${mimeType};base64,${bytes.toString("base64")}`
}
