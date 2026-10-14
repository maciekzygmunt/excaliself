// The socket shares the app's origin, so no extra port or env var.

/**
 * How a tab reaches a Room: by a Share link's token, or, for a Team Drawing,
 * by its id. A string, so hooks can key their effects on it.
 */
export type RoomPath = `rooms/${string}` | `drawings/${string}`

/** Matches `server/routes/ws/rooms/[token].ts` and `src/routes/api/rooms/`. */
export const roomPathForToken = (token: string): RoomPath =>
  `rooms/${encodeURIComponent(token)}`

/** Matches `server/routes/ws/drawings/[id].ts` and `src/routes/api/drawings/`. */
export const roomPathForDrawing = (drawingId: string): RoomPath =>
  `drawings/${encodeURIComponent(drawingId)}`

export function roomSocketUrl(
  room: RoomPath,
  location: { protocol: string; host: string },
): string {
  const scheme = location.protocol === "https:" ? "wss:" : "ws:"
  return `${scheme}//${location.host}/ws/${room}`
}

/** One image's URL, for both its POST and GET. Relative, so host-agnostic. */
export function roomFileUrl(room: RoomPath, fileId: string): string {
  return `/api/${room}/files/${encodeURIComponent(fileId)}`
}
