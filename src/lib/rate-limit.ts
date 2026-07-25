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
   * Hard ceiling on tracked keys. Keys arrive from strangers, so the map
   * sheds expired windows once it grows past this — and if a flood of
   * distinct keys leaves nothing expired to shed, it evicts the
   * longest-standing ones anyway. Bounded memory beats perfect accounting:
   * an evicted key gets a fresh budget, which is the price of not letting
   * the limiter itself become the way to exhaust the process.
   */
  maxTrackedKeys?: number
}): RateLimiter {
  const { limit, windowMs, maxTrackedKeys = 10_000 } = options
  /** Insertion-ordered, so the front of the map is the oldest window. */
  const windows = new Map<string, Window>()
  // Eviction goes past the ceiling rather than to it, so the scan is paid
  // once per batch of new keys instead of once per request.
  const evictTo = Math.max(1, Math.floor(maxTrackedKeys * 0.9))

  const expired = (window: Window, now: number) =>
    now - window.startedAt >= windowMs

  function shed(now: number, keep: string) {
    for (const [tracked, window] of windows) {
      if (expired(window, now)) windows.delete(tracked)
    }
    if (windows.size <= maxTrackedKeys) return
    for (const tracked of windows.keys()) {
      if (windows.size <= evictTo) break
      if (tracked !== keep) windows.delete(tracked)
    }
  }

  return {
    allow(key, now) {
      const current = windows.get(key)
      const window =
        current && !expired(current, now)
          ? current
          : { startedAt: now, count: 0 }
      window.count += 1
      windows.set(key, window)

      if (windows.size > maxTrackedKeys) shed(now, key)

      return window.count <= limit
    },
    trackedKeys: () => windows.size,
  }
}
