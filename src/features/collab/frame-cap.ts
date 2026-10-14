/** Larger frames close with 1009; the client heals via reconnect + resync. */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024

export const FRAME_TOO_LARGE_CLOSE_CODE = 1009

const encoder = new TextEncoder()

/** Exact UTF-8 size. Allocates a copy, so keep it off the hot path. */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * Whether a string or binary frame is over the cap. UTF-8 is 1–3 bytes per
 * UTF-16 unit, so most strings are decided by `.length` alone.
 */
export function exceedsFrameCap(
  raw: unknown,
  maxBytes: number = MAX_FRAME_BYTES,
): boolean {
  if (typeof raw === "string") {
    if (raw.length * 3 <= maxBytes) return false
    if (raw.length > maxBytes) return true
    return utf8ByteLength(raw) > maxBytes
  }
  if (ArrayBuffer.isView(raw)) return raw.byteLength > maxBytes
  if (raw instanceof ArrayBuffer) return raw.byteLength > maxBytes
  // Unknown shapes are the parser's to drop.
  return false
}
