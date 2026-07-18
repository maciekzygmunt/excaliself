import { queryOptions } from "@tanstack/react-query"
import { getPendingInvites } from "./server"

export const pendingInvitesQueryOptions = () =>
  queryOptions({
    queryKey: ["invites", "pending"] as const,
    queryFn: () => getPendingInvites(),
  })
