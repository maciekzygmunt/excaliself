import { queryOptions } from "@tanstack/react-query"
import { getPendingPasswordResets } from "./server"

export const pendingPasswordResetsQueryOptions = () =>
  queryOptions({
    queryKey: ["password-resets", "pending"] as const,
    queryFn: () => getPendingPasswordResets(),
  })
