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
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"

export const IMAGE_UPLOADS_PER_MINUTE = 30

const limiter = processSingleton("room-upload-rate-limit", () =>
  createRateLimiter({ limit: IMAGE_UPLOADS_PER_MINUTE, windowMs: 60_000 }),
)

/** Counts one upload for this IP in this room and says whether to serve it. */
export function allowImageUpload(
  request: { headers: Headers; socketIp?: string | null; roomId: string },
  now: number = Date.now(),
): boolean {
  return limiter.allow(`${request.roomId}|${clientIpKey(request)}`, now)
}
