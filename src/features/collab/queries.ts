import { queryOptions, useQuery } from "@tanstack/react-query"
import type { LiveDrawing } from "./live"
import { getLiveDrawings } from "./server"

/** The badge is ambient, so polling this slowly is fine. */
export const LIVE_POLL_INTERVAL_MS = 25_000

/** One shared key, so one poll loop. TanStack pauses it in hidden tabs. */
export const liveDrawingsQueryOptions = () =>
  queryOptions({
    queryKey: ["drawings", "live"] as const,
    queryFn: () => getLiveDrawings(),
    refetchInterval: LIVE_POLL_INTERVAL_MS,
    // Otherwise every navigation refetches on mount.
    staleTime: LIVE_POLL_INTERVAL_MS,
  })

/** Who else is in this drawing. Selects per row, so only that card re-renders. */
export function useLiveDrawing(drawingId: string): LiveDrawing | null {
  const { data } = useQuery({
    ...liveDrawingsQueryOptions(),
    select: (live) =>
      live.find((entry) => entry.drawingId === drawingId) ?? null,
  })
  return data ?? null
}
