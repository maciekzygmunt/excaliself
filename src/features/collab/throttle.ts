/**
 * The cursor channel's rate limit (spec §2.2): MOUSE_LOCATION is throttled to
 * ~33 ms client-side and is droppable — an update that arrives inside the
 * window is discarded rather than queued, because the next one supersedes it
 * anyway. Leading-edge only, so the first move of a gesture goes out at once.
 */

export const CURSOR_INTERVAL_MS = 33

/**
 * The follow-mode viewport channel. Same budget as cursors, but with a
 * trailing flush: the last frame of a pan is the one that decides where a
 * follower's canvas comes to rest, so dropping it would leave them parked
 * slightly off from the person they are following.
 *
 * That last frame is also the one with nothing behind it to supersede it, so
 * a `run` that reports failure (a congested socket, say) doesn't end the
 * flush — the value stays pending and is retried a window later. Whoever
 * owns the channel is expected to `cancel()` when it closes for good;
 * otherwise a permanently failing `run` retries forever.
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
    /** Run now if the window is open, otherwise at the end of it. */
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
