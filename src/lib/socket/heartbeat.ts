// App-level PING, since browsers can't send ws pings. Keeps idle sockets past a
// proxy's 60 s timeout; a missing PONG finds sockets that died without a FIN.

export const HEARTBEAT_INTERVAL_MS = 25_000

/** Generous: a false "dead" costs a full resync. */
export const HEARTBEAT_TIMEOUT_MS = 10_000

export type Heartbeat = ReturnType<typeof createHeartbeat>

export function createHeartbeat(options: {
  ping: () => void
  /** A ping went unanswered: the socket is dead even if it says `OPEN`. */
  onSilent: () => void
  intervalMs?: number
  timeoutMs?: number
}) {
  const {
    ping,
    onSilent,
    intervalMs = HEARTBEAT_INTERVAL_MS,
    timeoutMs = HEARTBEAT_TIMEOUT_MS,
  } = options

  let beat: ReturnType<typeof setInterval> | null = null
  let waiting: ReturnType<typeof setTimeout> | null = null

  const stopWaiting = () => {
    if (waiting !== null) clearTimeout(waiting)
    waiting = null
  }

  return {
    /** Call once the socket is open. */
    start() {
      if (beat !== null) return
      beat = setInterval(() => {
        // One outstanding ping at a time.
        if (waiting !== null) return
        // Armed before the send, so a synchronous reply finds the timer.
        waiting = setTimeout(() => {
          waiting = null
          onSilent()
        }, timeoutMs)
        ping()
      }, intervalMs)
    },

    acknowledge() {
      stopWaiting()
    },

    /** Call on close, and on unmount. Safe to call twice. */
    stop() {
      if (beat !== null) clearInterval(beat)
      beat = null
      stopWaiting()
    },
  }
}
