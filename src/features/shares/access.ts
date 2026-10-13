// Pure share-link access rule, free of db/session imports for unit tests.

export type ShareAudience = "members" | "anyone"

/** The one audience check, so the sign-in gate and guest eviction agree. */
export const admitsGuests = (audience: ShareAudience) => audience === "anyone"

export type ShareAccess =
  | "ok"
  | "signin"
  /** One value for every failure, so nothing leaks if the drawing exists. */
  | "dead"

export function resolveShareAccess(input: {
  share: { audience: ShareAudience; drawing: { deletedAt: Date | null } } | null
  hasSession: boolean
}): ShareAccess {
  const { share, hasSession } = input
  if (!share || share.drawing.deletedAt !== null) return "dead"
  if (!admitsGuests(share.audience) && !hasSession) return "signin"
  return "ok"
}
