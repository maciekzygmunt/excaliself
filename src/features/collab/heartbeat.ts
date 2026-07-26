/**
 * The app-level heartbeat of canvas sharing spec §5.3 and rollout note 2: a
 * `PING` every ~25 s so a reverse proxy's 60 s idle timeout never kills a
 * room where nobody happens to be drawing. Two people staring at a diagram
 * are a live session, and the socket has no way to say so on its own.
 *
 * It is app-level because a browser cannot send websocket ping frames from
 * JavaScript — only the server end can — and because the client is the end
 * that has to act when the answer stops coming.
 *
 * The `PONG` is not decoration. A TCP connection that dies without a FIN —
 * a laptop lid closing, a phone changing networks, a proxy dropping the
 * conntrack entry — leaves a socket that is `OPEN` forever and delivers
 * nothing. Waiting for a missing answer is the only way a client notices,
 * and noticing is what hands it to the reconnect loop.
 */

/** Comfortably inside the 60 s idle timeout, and cheap: one tiny frame. */
export const HEARTBEAT_INTERVAL_MS = 25_000

/**
 * How long a `PING` may go unanswered before the socket counts as dead.
 * Generous next to a round trip, because the alternative — dropping a live
 * connection over one slow answer — costs a `SCENE_INIT` resync.
 */
export const HEARTBEAT_TIMEOUT_MS = 10_000

export type Heartbeat = ReturnType<typeof createHeartbeat>

export function createHeartbeat(options: {
  /** Puts a `PING` on the wire. */
  ping: () => void
  /** A ping went unanswered: the socket is dead even if it says otherwise. */
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
        // One outstanding ping at a time: a second timer started while the
        // first is still running would shorten the window it was given.
        if (waiting !== null) return
        // Armed before the send, not after: `ping` reaches the socket, and a
        // socket that answers synchronously — a test double, a same-process
        // loopback — would otherwise have its `acknowledge` land on a timer
        // that does not exist yet, and be forgotten.
        waiting = setTimeout(() => {
          waiting = null
          onSilent()
        }, timeoutMs)
        ping()
      }, intervalMs)
    },

    /** A `PONG` came back — the socket is answering. */
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
