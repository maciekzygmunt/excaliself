/**
 * Image uploads per IP per room, in-process. GETs are unmetered: a late joiner
 * fetches every image, and the token guards reads.
 */

import { clientIpKey } from "@/lib/client-ip"
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"

export const IMAGE_UPLOADS_PER_MINUTE = 30

const limiter = processSingleton("room-upload-rate-limit", () =>
  createRateLimiter({ limit: IMAGE_UPLOADS_PER_MINUTE, windowMs: 60_000 }),
)

export function allowImageUpload(
  request: { headers: Headers; socketIp?: string | null; roomId: string },
  now: number = Date.now(),
): boolean {
  return limiter.allow(`${request.roomId}|${clientIpKey(request)}`, now)
}
