import { queryOptions } from "@tanstack/react-query"
import { getAllUsers, getUserContentCounts } from "./server"

export type AdminUser = Awaited<ReturnType<typeof getAllUsers>>[number]

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "users"] as const,
    queryFn: () => getAllUsers(),
  })

export const userContentCountsQueryOptions = (userId: string) =>
  queryOptions({
    queryKey: ["admin", "users", userId, "contentCounts"] as const,
    queryFn: () => getUserContentCounts({ data: userId }),
  })
