/**
 * How big a frame this protocol will carry (canvas sharing spec §5.4), and
 * the one measurement both ends need to answer it.
 *
 * Apart from `protocol.ts` because that file is about wire *shapes* — what a
 * message says — and this is about the envelope it arrives in. The client
 * reads it to decide how to cut a big scene sync up; the server reads it to
 * decide whether to hang up.
 */

/**
 * Every frame this protocol will accept, in bytes. Anything larger closes
 * the socket with the standard 1009 (message too big); the client self-heals
 * through the same reconnect + `SCENE_INIT` resync as any other drop, so
 * there is no error channel for it.
 */
export const MAX_FRAME_BYTES = 4 * 1024 * 1024

/** WebSocket's own "message too big" code — what an oversized frame closes with. */
export const FRAME_TOO_LARGE_CLOSE_CODE = 1009

const encoder = new TextEncoder()

/**
 * Exact UTF-8 size of a string. Allocates a copy, so callers keep it off the
 * hot path — {@link exceedsFrameCap} only reaches for it in the narrow band
 * where the cheap bounds cannot decide.
 */
export function utf8ByteLength(text: string): number {
  return encoder.encode(text).length
}

/**
 * Whether a frame is over the cap, given whatever the transport handed over.
 * Both shapes are live: the client measures a string it is about to send,
 * and crossws's node adapter hands the server the frame as a Buffer.
 *
 * The string path is written around the two bounds that need no work:
 * UTF-8 never spends fewer bytes than there are UTF-16 code units, and never
 * more than three per unit. Every real frame — a cursor at 30 Hz, a
 * one-element delta — is decided by a comparison against `.length`, and only
 * a payload in the megabyte band is actually measured.
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
  // Buffer is a Uint8Array, so the view check covers the node adapter too.
  if (ArrayBuffer.isView(raw)) return raw.byteLength > maxBytes
  if (raw instanceof ArrayBuffer) return raw.byteLength > maxBytes
  // Anything else is a shape this protocol does not speak; the parser will
  // drop it, and refusing to guess its size is not the cap's job.
  return false
}
