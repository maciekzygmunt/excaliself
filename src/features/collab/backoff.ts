// Reconnect delay. Never gives up: a deploy can take over a minute.

export const RECONNECT_BASE_DELAY_MS = 1_000

export const RECONNECT_MAX_DELAY_MS = 10_000

/** Equal jitter, not full: full jitter can retry at ~0 ms after a deploy. */
export function createReconnectBackoff(random: () => number = Math.random) {
  let attempt = 0

  return {
    next(): number {
      const window = Math.min(
        RECONNECT_MAX_DELAY_MS,
        RECONNECT_BASE_DELAY_MS * 2 ** attempt,
      )
      attempt += 1
      return window / 2 + (window / 2) * random()
    },

    /** Call once a dial lands a join. */
    reset() {
      attempt = 0
    },
  }
}

export type ReconnectBackoff = ReturnType<typeof createReconnectBackoff>
