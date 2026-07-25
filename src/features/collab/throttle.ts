/**
 * The cursor channel's rate limit (spec §2.2): MOUSE_LOCATION is throttled to
 * ~33 ms client-side and is droppable — an update that arrives inside the
 * window is discarded rather than queued, because the next one supersedes it
 * anyway. Leading-edge only, so the first move of a gesture goes out at once.
 */

export const CURSOR_INTERVAL_MS = 33

export function createDroppableThrottle(
  intervalMs: number,
  now: () => number = () => Date.now(),
) {
  let lastSentAt = Number.NEGATIVE_INFINITY
  return function allow(): boolean {
    const at = now()
    if (at - lastSentAt < intervalMs) return false
    lastSentAt = at
    return true
  }
}
