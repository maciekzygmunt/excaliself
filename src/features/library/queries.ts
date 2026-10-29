import { queryOptions } from "@tanstack/react-query"
import { getLibrary } from "./server"

/** Never stale: the lists socket says when it changed. */
export const libraryQueryOptions = () =>
  queryOptions({
    queryKey: ["library"] as const,
    queryFn: () => getLibrary(),
    staleTime: Number.POSITIVE_INFINITY,
  })
