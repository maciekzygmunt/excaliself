import { queryOptions } from "@tanstack/react-query"
import { getFolders } from "./server"

export type Folder = Awaited<ReturnType<typeof getFolders>>[number]

export const foldersQueryOptions = () =>
  queryOptions({
    queryKey: ["folders"] as const,
    queryFn: () => getFolders(),
  })
