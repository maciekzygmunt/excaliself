/**
 * How long a client waits before dialing the room again (canvas sharing spec
 * §5.3). Exponential from ~1 s to a 10 s cap, jittered, and it never gives
 * up: a Coolify deploy takes a minute-plus, and the tab that stops retrying
 * at attempt eight is a tab whose owner has to notice and reload.
 *
 * The cap is what makes "indefinitely" affordable — a room of twenty tabs
 * settles into one dial every ~10 s each, which is nothing next to the
 * cursor traffic they generate when the server is up.
 */

/** First wait after a clean connection drops. */
export const RECONNECT_BASE_DELAY_MS = 1_000

/** The ceiling every subsequent wait converges on. */
export const RECONNECT_MAX_DELAY_MS = 10_000

/**
 * Equal jitter rather than full jitter: half the window is fixed and half is
 * drawn. Full jitter would let a tab retry a few milliseconds after a failure
 * — with a whole office reconnecting after a deploy, that is the thundering
 * herd the backoff exists to prevent. Halving the window still spreads the
 * herd across five seconds at the cap.
 */
export function createReconnectBackoff(random: () => number = Math.random) {
  let attempt = 0

  return {
    /** The wait before the next dial, in milliseconds. */
    next(): number {
      const window = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** attempt,
      )
      attempt += 1
      return window / 2 + (window / 2) * random()
    },

    /** Called once a dial actually lands a join, so the next outage starts over. */
    reset() {
      attempt = 0
    },
  }
}

export type ReconnectBackoff = ReturnType<typeof createReconnectBackoff>
