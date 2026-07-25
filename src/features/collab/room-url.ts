/**
 * Where a client dials a room. The socket shares port 3000 with the app —
 * no new ports, no new env vars (spec §2.1, §6) — so the URL is always the
 * page's own origin with the ws/wss scheme.
 */

/** Matches the nitro route file at `server/routes/ws/rooms/[token].ts`. */
export const ROOM_ROUTE_PREFIX = "/ws/rooms"

export function roomSocketUrl(
  token: string,
  location: { protocol: string; host: string },
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:"
  return `${scheme}//${location.host}${ROOM_ROUTE_PREFIX}/${encodeURIComponent(token)}`
}
