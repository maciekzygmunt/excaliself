import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { type Folder, foldersQueryOptions } from "./queries"
import { updateFolder } from "./server"

type RenameVars = Parameters<typeof updateFolder>[0]

export function useRenameFolder() {
  return useOptimisticListMutation<Folder, RenameVars>({
    queryKey: foldersQueryOptions().queryKey,
    mutationFn: updateFolder,
    optimisticUpdate: (folders, { data }) =>
      folders.map((f) =>
        f.id === data.id ? { ...f, name: data.name ?? f.name } : f,
      ),
  })
}
