import { queryOptions } from "@tanstack/react-query"
import { getTrashItems } from "./server"

export type TrashItems = Awaited<ReturnType<typeof getTrashItems>>
export type TrashedDrawing = TrashItems["drawings"][number]
export type TrashedFolder = TrashItems["folders"][number]

export const trashQueryOptions = () =>
  queryOptions({
    queryKey: ["trash"] as const,
    queryFn: () => getTrashItems(),
  })
