/**
 * The token-validation limiter (canvas sharing spec §4.5): 60 validations a
 * minute per IP, counted in this process.
 *
 * One budget for both guest surfaces — the share page loader and the
 * websocket upgrade — because they resolve the same token against the same
 * database, and a script hammering either is the thing being blunted. The
 * ceiling is set so a NAT'd office reconnecting after a deploy never trips
 * it; a person cannot reach it by hand.
 */

import { clientIpKey } from "@/lib/client-ip"
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"

export const TOKEN_VALIDATIONS_PER_MINUTE = 60

const limiter = processSingleton("share-token-rate-limit", () =>
  createRateLimiter({ limit: TOKEN_VALIDATIONS_PER_MINUTE, windowMs: 60_000 }),
)

/**
 * Counts one validation for the caller's IP and says whether to serve it.
 * Refusals are a 429 on the share page and a refused upgrade on the socket.
 */
export function allowTokenValidation(
  request: { headers: Headers; socketIp?: string | null },
  now: number = Date.now(),
): boolean {
  return limiter.allow(clientIpKey(request), now)
}
