// One per-IP budget of failed token lookups, shared by the share page and the
// ws upgrade. Live links never spend it, so a NAT'd office can't lock itself
// out; it only slows guessing, which 256-bit tokens make hopeless anyway.

import { clientIpKey } from "@/lib/client-ip"
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"

export const FAILED_TOKEN_LOOKUPS_PER_MINUTE = 60

type TokenRequest = { headers: Headers; socketIp?: string | null }

const limiter = processSingleton("share-token-rate-limit", () =>
  createRateLimiter({
    limit: FAILED_TOKEN_LOOKUPS_PER_MINUTE,
    windowMs: 60_000,
  }),
)

/** Checked before the lookup, so a guessing flood costs the db nothing. */
export function tokenLookupsBlocked(
  request: TokenRequest,
  now: number = Date.now(),
): boolean {
  return limiter.exhausted(clientIpKey(request), now)
}

export function recordFailedTokenLookup(
  request: TokenRequest,
  now: number = Date.now(),
): void {
  limiter.allow(clientIpKey(request), now)
}
