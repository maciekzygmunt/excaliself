import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { type Drawing, drawingsQueryOptions } from "@/features/drawings/queries"
import {
  patchById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { type Folder, foldersQueryOptions } from "./queries"
import { deleteFolder, updateFolder } from "./server"

type RenameVars = Parameters<typeof updateFolder>[0]

export function useRenameFolder() {
  return useOptimisticListMutation<Folder, RenameVars>({
    queryKey: foldersQueryOptions().queryKey,
    mutationFn: updateFolder,
    optimisticUpdate: (folders, { data }) =>
      patchById(folders, data.id, { name: data.name }),
  })
}

/**
 * Optimistically deletes a folder and prunes its descendant folders + drawings
 * from the sidebar caches (server delete cascades via FK on delete).
 */
export function useDeleteFolder() {
  const queryClient = useQueryClient()
  const foldersKey = foldersQueryOptions().queryKey
  const drawingsKey = drawingsQueryOptions().queryKey

  return useMutation({
    mutationFn: deleteFolder,
    onMutate: async ({ data: id }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: foldersKey }),
        queryClient.cancelQueries({ queryKey: drawingsKey }),
      ])
      const prevFolders = queryClient.getQueryData<Folder[]>(foldersKey)
      const prevDrawings = queryClient.getQueryData<Drawing[]>(drawingsKey)
      const subtree = collectFolderSubtreeIds(prevFolders ?? [], id)

      queryClient.setQueryData<Folder[]>(foldersKey, (list = []) =>
        list.filter((f) => !subtree.has(f.id)),
      )
      queryClient.setQueryData<Drawing[]>(drawingsKey, (list = []) =>
        list.filter((d) => !d.folderId || !subtree.has(d.folderId)),
      )
      return { prevFolders, prevDrawings }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(foldersKey, context?.prevFolders)
      queryClient.setQueryData(drawingsKey, context?.prevDrawings)
      toast.error("Failed to delete folder")
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: foldersKey })
      queryClient.invalidateQueries({ queryKey: drawingsKey })
    },
  })
}

/** Walks parentId to collect a folder and all its descendant folder ids. */
function collectFolderSubtreeIds(
  folders: Folder[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const folder of folders) {
    if (!folder.parentId) continue
    const list = childrenByParent.get(folder.parentId)
    if (list) list.push(folder.id)
    else childrenByParent.set(folder.parentId, [folder.id])
  }

  const subtree = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()
    if (!id) continue
    for (const childId of childrenByParent.get(id) ?? []) {
      if (subtree.has(childId)) continue
      subtree.add(childId)
      stack.push(childId)
    }
  }
  return subtree
}
