import { queryOptions } from "@tanstack/react-query"
import { getDrawingShare } from "./server"

/** null = unshared; a row = the drawing's one live link. */
export type DrawingShare = Awaited<ReturnType<typeof getDrawingShare>> | null

export const drawingShareQueryOptions = (drawingId: string) =>
  queryOptions({
    queryKey: ["shares", drawingId] as const,
    // The explicit annotation restores null in the type: the server fn's
    // client-side signature strips it, and the cache needs "unshared" to be
    // a storable value (undefined means "not fetched yet").
    queryFn: async (): Promise<DrawingShare> =>
      (await getDrawingShare({ data: drawingId })) ?? null,
  })
