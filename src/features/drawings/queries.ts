import { queryOptions } from "@tanstack/react-query"
import { getDrawings, getDrawingWithFiles } from "./server"

export type Drawing = Awaited<ReturnType<typeof getDrawings>>[number]

export const drawingsQueryOptions = () =>
  queryOptions({
    queryKey: ["drawings"] as const,
    queryFn: () => getDrawings(),
  })

export const drawingQueryOptions = (id: string) =>
  queryOptions({
    queryKey: ["drawings", id] as const,
    queryFn: () => getDrawingWithFiles({ data: id }),
  })
