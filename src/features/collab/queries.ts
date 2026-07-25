import { queryOptions, useQuery } from "@tanstack/react-query"
import type { LiveDrawing } from "./live"
import { getLiveDrawings } from "./server"

/**
 * Mid-range of the spec's 20–30 s window (§1.5). The badge is ambient, so a
 * join or a leave taking up to half a minute to show is the whole point of
 * polling instead of subscribing.
 */
export const LIVE_POLL_INTERVAL_MS = 25_000

/**
 * The one live query. Every gallery card and every sidebar row reads this
 * same key, so however many surfaces are mounted there is exactly one poll
 * loop — and TanStack pauses interval refetching in a hidden tab, which is
 * where the "while visible" of the spec comes from for free.
 */
export const liveDrawingsQueryOptions = () =>
  queryOptions({
    queryKey: ["drawings", "live"] as const,
    queryFn: () => getLiveDrawings(),
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    // Without this, every navigation would refetch on mount and poll far
    // harder than the interval asks for. It does not stop the `["drawings"]`
    // invalidations behind rename/star/move/trash from prefix-matching this
    // key — that's an extra Map scan on an action the user just took, which
    // is cheap enough to leave alone rather than break the shared key the
    // spec asks for.
    staleTime: LIVE_POLL_INTERVAL_MS,
  })

/**
 * Who else is in this one drawing right now, or null when nobody is.
 *
 * Selecting per row rather than handing the whole list down means a card only
 * re-renders when its own entry changes — the other ninety-nine cards sit
 * still through a poll that found one new visitor.
 */
export function useLiveDrawing(drawingId: string): LiveDrawing | null {
  const { data } = useQuery({
    ...liveDrawingsQueryOptions(),
    select: (live) =>
      live.find((entry) => entry.drawingId === drawingId) ?? null,
  })
  return data ?? null
}
