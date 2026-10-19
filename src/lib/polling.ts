// Freshness for data teammates change. Structural list changes are pushed
// (see features/list-updates); the poll covers the rest, such as scene edits
// and live badges, and refetches when the tab regains focus. TanStack pauses
// the poll in hidden tabs.
export const POLL_INTERVAL_MS = 25_000

/** Query options for a polled query, spread into queryOptions(). */
export const polled = {
  refetchInterval: POLL_INTERVAL_MS,
  refetchOnWindowFocus: true,
  // Otherwise every navigation refetches on mount.
  staleTime: POLL_INTERVAL_MS,
} as const
