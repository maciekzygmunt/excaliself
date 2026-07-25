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
import { createRateLimiter, type RateLimiter } from "@/lib/rate-limit"

export const TOKEN_VALIDATIONS_PER_MINUTE = 60

/**
 * The build splits the app across bundles — the nitro websocket route and the
 * server functions are separate rollup outputs — so a plain module-level
 * `const` is instantiated once per bundle and the two surfaces would each get
 * a budget of their own (verified in `.output/server`, not a theory). They do
 * share a process, so the registered symbol is what makes the budget one.
 */
const LIMITER = Symbol.for("excaliself.share-token-rate-limit")
type Host = typeof globalThis & { [LIMITER]?: RateLimiter }

const host = globalThis as Host
host[LIMITER] ??= createRateLimiter({
  limit: TOKEN_VALIDATIONS_PER_MINUTE,
  windowMs: 60_000,
})
const limiter: RateLimiter = host[LIMITER]

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
