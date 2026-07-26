// Pure share-link access rule (canvas sharing spec §4.1), shared by the
// /share/$token route today and the websocket upgrade hook later. Kept free
// of db/session imports so the full validation matrix is unit-testable.

export type ShareAudience = "members" | "anyone"

/**
 * Whether this audience lets in a visitor who never signed in. The one place
 * the two values are told apart, so the rule that turns a session-less visit
 * into the sign-in gate and the rule that evicts guests when a link tightens
 * cannot drift out of step (spec §4.1, §4.2).
 */
export const admitsGuests = (audience: ShareAudience) => audience === "anyone"

export type ShareAccess =
  /** Valid link, audience satisfied — open the drawing. */
  | "ok"
  /** Valid members-only link but no session — sign-in gate. */
  | "signin"
  /**
   * Everything else: unknown token, trashed drawing. Every dead reason maps
   * to this one value so nothing leaks about whether a drawing exists.
   */
  | "dead"

export function resolveShareAccess(input: {
  /** The share row the token resolved to, or null for an unknown token. */
  share: { audience: ShareAudience } | null
  /** The shared drawing, when the token resolved. */
  drawing: { deletedAt: Date | null } | null
  hasSession: boolean
}): ShareAccess {
  const { share, drawing, hasSession } = input
  if (!share || !drawing) return "dead"
  if (drawing.deletedAt !== null) return "dead"
  if (!admitsGuests(share.audience) && !hasSession) return "signin"
  return "ok"
}
