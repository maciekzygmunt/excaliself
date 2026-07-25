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
 */
export function createTrailingThrottle<T>(
  intervalMs: number,
  run: (value: T) => void,
) {
  let lastRunAt = Number.NEGATIVE_INFINITY
  let pending: { value: T } | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  const fire = (value: T) => {
    lastRunAt = Date.now()
    run(value)
  }

  const cancel = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = null
  }

  return {
    /** Run now if the window is open, otherwise at the end of it. */
    push(value: T) {
      const wait = intervalMs - (Date.now() - lastRunAt)
      if (wait <= 0) {
        cancel()
        fire(value)
        return
      }
      pending = { value }
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        const next = pending
        pending = null
        if (next) fire(next.value)
      }, wait)
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
