import { queryOptions } from "@tanstack/react-query"
import { getCurrentUser } from "./server"

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>

export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "currentUser"] as const,
    queryFn: () => getCurrentUser(),
  })
