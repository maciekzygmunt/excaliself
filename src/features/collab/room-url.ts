// The socket shares the app's origin, so no extra port or env var.

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

/** One image's URL, for both its POST and GET. Relative, so host-agnostic. */
export function roomFileUrl(token: string, fileId: string): string {
  return `${ROOM_FILES_ROUTE_PREFIX}/${encodeURIComponent(token)}/files/${encodeURIComponent(fileId)}`
}
