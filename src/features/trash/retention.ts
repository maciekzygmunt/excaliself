// The 30-day retention window (spec §5.11). Pure date math, shared by every
// surface that discloses when a trashed item will be purged.

export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole days (ceiling) until `deletedAt + 30d`; 0 or negative means due. */
export function daysUntilPurge(
  deletedAt: Date | string,
  now: number = Date.now(),
): number {
  const purgeAt = new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS
  return Math.ceil((purgeAt - now) / DAY_MS)
}

/** Card meta line: "Purges in N days" (spec §5.11), collapsing sensibly. */
export function purgeCountdownLabel(
  deletedAt: Date | string,
  now: number = Date.now(),
): string {
  const days = daysUntilPurge(deletedAt, now)
  if (days <= 0) return "Purges today"
  if (days === 1) return "Purges in 1 day"
  return `Purges in ${days} days`
}
