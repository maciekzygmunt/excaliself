import { queryOptions } from "@tanstack/react-query"
import { getShareForDrawing } from "./server"

export type Share = { token: string; audience: "members" | "anyone" }

export const shareQueryOptions = (drawingId: string) =>
  queryOptions({
    queryKey: ["share", drawingId],
    queryFn: async (): Promise<Share | null> =>
      getShareForDrawing({ data: drawingId }),
  })

export const shareUrl = (token: string) =>
  `${window.location.origin}/share/${token}`
