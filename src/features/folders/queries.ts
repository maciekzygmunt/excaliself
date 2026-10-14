import { queryOptions } from "@tanstack/react-query"
import { polled } from "@/lib/polling"
import { getFolders } from "./server"

export type Folder = Awaited<ReturnType<typeof getFolders>>[number]

/** Polled: teammates' Team folders show up without a reload. */
export const foldersQueryOptions = () =>
  queryOptions({
    queryKey: ["folders"] as const,
    queryFn: () => getFolders(),
    ...polled,
  })
