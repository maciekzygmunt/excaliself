import { queryOptions, useQuery } from "@tanstack/react-query"
import { polled } from "@/lib/polling"
import type { LiveDrawing } from "./live"
import { getLiveDrawings } from "./server"

/** One shared key, so one poll loop. The badge is ambient, so polling is fine. */
export const liveDrawingsQueryOptions = () =>
  queryOptions({
    queryKey: ["drawings", "live"] as const,
    queryFn: () => getLiveDrawings(),
    ...polled,
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
