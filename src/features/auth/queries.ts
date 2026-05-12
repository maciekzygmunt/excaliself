import { queryOptions } from "@tanstack/react-query"
import { getPendingInvites } from "./server"

export const pendingInvitesQueryOptions = () =>
  queryOptions({
    queryKey: ["admin", "invites"] as const,
    queryFn: () => getPendingInvites(),
  })
