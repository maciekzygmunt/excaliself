/**
 * The image-upload limiter (canvas sharing spec §4.5, limiter 3): 30 uploads
 * a minute per IP per room, counted in this process.
 *
 * Per room rather than per IP alone, because a room is the unit a share link
 * hands out: one visitor pasting a burst of screenshots into their own
 * drawing must not spend the budget of a colleague working in another.
 *
 * Only uploads are counted. A GET is deliberately unmetered — a late joiner
 * legitimately makes one request per image on the canvas, so any budget small
 * enough to blunt abuse would break the feature it protects. What guards the
 * read side is the 256-bit token (spec §4.5).
 */

import { clientIpKey } from "@/lib/client-ip"
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit"

export const IMAGE_UPLOADS_PER_MINUTE = 30

/**
 * Registered on `globalThis` for the same reason the token limiter is: the
 * build splits the app across bundles, and a plain module-level `const` would
 * hand each output a budget of its own.
 */
const LIMITER = Symbol.for("excaliself.room-upload-rate-limit")
type Host = typeof globalThis & { [LIMITER]?: RateLimiter }

const host = globalThis as Host
host[LIMITER] ??= createRateLimiter({
  limit: IMAGE_UPLOADS_PER_MINUTE,
  windowMs: 60_000,
})
const limiter: RateLimiter = host[LIMITER]

/** Counts one upload for this IP in this room and says whether to serve it. */
export function allowImageUpload(
  request: { headers: Headers; socketIp?: string | null; roomId: string },
  now: number = Date.now(),
): boolean {
  return limiter.allow(`${request.roomId}|${clientIpKey(request)}`, now)
}
