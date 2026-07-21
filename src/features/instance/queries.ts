import { queryOptions } from "@tanstack/react-query"
import { getInstanceStats } from "./server"

export const instanceStatsQueryOptions = () =>
  queryOptions({
    queryKey: ["instance", "stats"] as const,
    queryFn: () => getInstanceStats(),
  })
