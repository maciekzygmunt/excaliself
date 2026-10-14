import { queryOptions } from "@tanstack/react-query"
import { getDrawingShare } from "./server"

/** null = unshared; a row = the drawing's one live link. */
export type DrawingShare = Awaited<ReturnType<typeof getDrawingShare>> | null

export const drawingShareQueryOptions = (drawingId: string) =>
  queryOptions({
    queryKey: ["shares", drawingId] as const,
    // Restores the null the client type strips; undefined means unfetched.
    queryFn: async (): Promise<DrawingShare> =>
      (await getDrawingShare({ data: drawingId })) ?? null,
  })
