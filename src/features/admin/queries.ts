import { queryOptions } from "@tanstack/react-query"
import { getAllUsers } from "./server"

export type AdminUser = Awaited<ReturnType<typeof getAllUsers>>[number]

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "users"] as const,
    queryFn: () => getAllUsers(),
  })
