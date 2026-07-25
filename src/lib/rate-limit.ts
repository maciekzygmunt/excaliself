/**
 * The one rate limiter shape this app uses (canvas sharing spec §4.5): a
 * fixed window per key, counted in memory. Deliberately not a token bucket
 * and not backed by anything — the app is single-replica by design (spec
 * §2.3), and the limits exist to blunt scripted abuse of the guest surfaces,
 * not to meter anything.
 *
 * `now` is a parameter rather than a `Date.now()` call so the whole window
 * behavior is drivable from tests without fake timers.
 */

type Window = { startedAt: number; count: number }

export type RateLimiter = {
  /** Counts one hit for `key` and says whether it fits in the budget. */
  allow(key: string, now: number): boolean
  /** How many keys are being tracked — the number the sweep exists to bound. */
  trackedKeys(): number
}

export function createRateLimiter(options: {
  limit: number
  windowMs: number
  /**
   * Sweep threshold, not a hard cap: keys arrive from strangers, so the map
   * sheds expired windows once it grows past this rather than accumulating
   * one entry per address that ever knocked.
   */
  maxTrackedKeys?: number
}): RateLimiter {
  const { limit, windowMs, maxTrackedKeys = 10_000 } = options
  const windows = new Map<string, Window>()

  const expired = (window: Window, now: number) =>
    now - window.startedAt >= windowMs

  return {
    allow(key, now) {
      if (windows.size > maxTrackedKeys) {
        for (const [tracked, window] of windows) {
          if (expired(window, now)) windows.delete(tracked)
        }
      }

      const current = windows.get(key)
      const window =
        current && !expired(current, now)
          ? current
          : { startedAt: now, count: 0 }
      window.count += 1
      windows.set(key, window)

      return window.count <= limit
    },
    trackedKeys: () => windows.size,
  }
}
