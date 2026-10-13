// Cursor updates inside the window are dropped: the next one supersedes them.

export const CURSOR_INTERVAL_MS = 33

/**
 * Throttle with a trailing flush, so a follower lands on a pan's last frame.
 * A failed `run` retries until `cancel()`.
 */
export function createTrailingThrottle<T>(
  intervalMs: number,
  /** Returns whether the value went out; false holds it for a retry. */
  run: (value: T) => boolean,
) {
  let lastRunAt = Number.NEGATIVE_INFINITY
  let pending: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  const arm = (delay: number) => {
    if (timer !== null) return
    timer = setTimeout(() => {
      timer = null
      const next = pending
      pending = null
      if (next) attempt(next.value)
    }, delay)
  }

  const attempt = (value: T) => {
    if (!run(value)) {
      pending = { value }
      arm(intervalMs)
      return
    }
    lastRunAt = Date.now()
  }

  return {
    push(value: T) {
      const wait = intervalMs - (Date.now() - lastRunAt)
      if (wait <= 0) {
        cancel()
        attempt(value)
        return
      }
      pending = { value }
      arm(wait)
    },
    cancel,
  }
}

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
