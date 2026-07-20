// The single source of truth for the 30-day retention window (spec §5.11).
// The server purge job (purge.ts) and every surface that discloses when a
// trashed item will be purged must derive from these helpers so the promised
// countdown matches the real horizon. Deliberately dependency-free so client
// code can import it safely.

export const TRASH_RETENTION_DAYS = 30

const DAY_MS = 24 * 60 * 60 * 1000

/** The instant an item trashed at `deletedAt` becomes eligible for purge. */
export function purgeDeadline(deletedAt: Date | string): Date {
  return new Date(new Date(deletedAt).getTime() + TRASH_RETENTION_DAYS * DAY_MS)
}

/**
 * The mirror image of purgeDeadline for the purge job: items with
 * deletedAt on or before this cutoff have a lapsed deadline at `now`.
 */
export function purgeCutoff(now: Date): Date {
  return new Date(now.getTime() - TRASH_RETENTION_DAYS * DAY_MS)
}

/**
 * Whole days left before the purge deadline, for "Purges in N days" copy.
 * Rounds up (29.1 days left reads "30 days") and clamps at 0 for overdue
 * items awaiting the next purge pass.
 */
export function daysUntilPurge(
  deletedAt: Date | string,
  now: number | Date = Date.now(),
): number {
  const nowMs = typeof now === "number" ? now : now.getTime()
  const msLeft = purgeDeadline(deletedAt).getTime() - nowMs
  return Math.max(0, Math.ceil(msLeft / DAY_MS))
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
