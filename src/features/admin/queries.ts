import { queryOptions } from "@tanstack/react-query"
import { getAllUsers } from "./server"

export const usersQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "users"] as const,
    queryFn: () => getAllUsers(),
  })
