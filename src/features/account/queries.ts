import { queryOptions } from "@tanstack/react-query"
import { polled } from "@/lib/polling"
import {
  getCurrentUser,
  getDeleteAccountState,
  getMyContentCounts,
  listActiveSessions,
} from "./server"

export type CurrentUser = Awaited<ReturnType<typeof getCurrentUser>>
export type ActiveSession = Awaited<
  ReturnType<typeof listActiveSessions>
>[number]

/** Polled, so teamEnabled turns on once a second member joins. */
export const currentUserQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "currentUser"] as const,
    queryFn: () => getCurrentUser(),
    ...polled,
  })

export const sessionsQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "sessions"] as const,
    queryFn: () => listActiveSessions(),
  })

export const deleteAccountStateQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "deleteAccountState"] as const,
    queryFn: () => getDeleteAccountState(),
  })

export const myContentCountsQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "contentCounts"] as const,
    queryFn: () => getMyContentCounts(),
  })
