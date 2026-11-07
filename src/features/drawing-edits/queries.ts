import { queryOptions } from "@tanstack/react-query"
import { getDrawingEdit } from "./server"

type FetchedEdit = NonNullable<Awaited<ReturnType<typeof getDrawingEdit>>>

/** `expiresAt` is on this tab's clock. */
export type PendingDrawingEdit = Omit<FetchedEdit, "expiresInMs"> & {
  expiresAt: number
}

export const drawingEditQueryOptions = (drawingId: string) =>
  queryOptions({
    queryKey: ["drawing-edits", drawingId] as const,
    queryFn: async (): Promise<PendingDrawingEdit | null> => {
      const edit = await getDrawingEdit({ data: drawingId })
      if (!edit) return null
      const { expiresInMs, ...rest } = edit
      return { ...rest, expiresAt: Date.now() + expiresInMs }
    },
  })
