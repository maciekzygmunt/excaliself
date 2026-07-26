/**
 * Where a client dials a room. The socket shares port 3000 with the app —
 * no new ports, no new env vars (spec §2.1, §6) — so the URL is always the
 * page's own origin with the ws/wss scheme.
 */

/** Matches the nitro route file at `server/routes/ws/rooms/[token].ts`. */
export const ROOM_ROUTE_PREFIX = "/ws/rooms"

/** Matches the route file at `src/routes/api/rooms/$token/files/$fileId.ts`. */
export const ROOM_FILES_ROUTE_PREFIX = "/api/rooms"

export function roomSocketUrl(
  token: string,
  location: { protocol: string; host: string },
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:"
  return `${scheme}//${location.host}${ROOM_ROUTE_PREFIX}/${encodeURIComponent(token)}`
}

/**
 * Where one image lives, for both the POST that stores it and the GET that
 * fetches it (spec §2.4). Same-origin and relative: the blob endpoint rides
 * the page's own origin, so nothing here needs to know the deployment's host.
 */
export function roomFileUrl(token: string, fileId: string): string {
  return `${ROOM_FILES_ROUTE_PREFIX}/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`
}
