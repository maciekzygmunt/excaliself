import { queryOptions } from "@tanstack/react-query"
import { getDrawingScene, getDrawings, getDrawingWithFiles } from "./server"

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

/**
 * A card's scene, keyed by its edit time: an edit makes a new key, so a card
 * refetches only after its drawing changed. Not under ["drawings"], so list
 * invalidations don't refetch every visible card.
 */
export const drawingSceneQueryOptions = (id: string, updatedAt: Date) =>
  queryOptions({
    queryKey: ["drawing-scene", id, new Date(updatedAt).getTime()] as const,
    queryFn: () => getDrawingScene({ data: id }),
    staleTime: Number.POSITIVE_INFINITY,
  })
