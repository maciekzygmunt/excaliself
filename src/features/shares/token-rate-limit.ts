// One per-IP budget shared by the share page and the ws upgrade. High enough
// that a NAT'd office reconnecting after a deploy never trips it.

import { clientIpKey } from "@/lib/client-ip"
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"

export const TOKEN_VALIDATIONS_PER_MINUTE = 60

const limiter = processSingleton("share-token-rate-limit", () =>
  createRateLimiter({ limit: TOKEN_VALIDATIONS_PER_MINUTE, windowMs: 60_000 }),
)

export function allowTokenValidation(
  request: { headers: Headers; socketIp?: string | null },
  now: number = Date.now(),
): boolean {
  return limiter.allow(clientIpKey(request), now)
}
