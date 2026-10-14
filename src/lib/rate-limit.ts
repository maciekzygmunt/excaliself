// Fixed-window, in-memory limiter: the app is single-replica, and it only
// blunts scripted abuse.

type Window = { startedAt: number; count: number }

export type RateLimiter = {
  /** Spends one unit; false once the window's budget is gone. */
  allow(key: string, now: number): boolean
  /** True when the budget is gone, without spending anything. */
  exhausted(key: string, now: number): boolean
  trackedKeys(): number
}

export function createRateLimiter(options: {
  limit: number
  windowMs: number
  /** Keys come from strangers: past this, the oldest are evicted. */
  maxTrackedKeys?: number
}): RateLimiter {
  const { limit, windowMs, maxTrackedKeys = 10_000 } = options
  const windows = new Map<string, Window>()
  // Evict below the ceiling so the scan runs once per batch, not per request.
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
    exhausted(key, now) {
      const window = windows.get(key)
      return !!window && !expired(window, now) && window.count >= limit
    },
    trackedKeys: () => windows.size,
  }
}
