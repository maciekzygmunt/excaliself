import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { type Drawing, drawingsQueryOptions } from "@/features/drawings/queries"
import {
  patchById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { type Folder, foldersQueryOptions } from "./queries"
import {
  createFolder,
  restoreFolder,
  trashFolder,
  updateFolder,
} from "./server"
import { collectFolderSubtreeIds } from "./subtree"

type RenameVars = Parameters<typeof updateFolder>[0]

export function useCreateFolder() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createFolder,
    onSettled: () => queryClient.invalidateQueries(foldersQueryOptions()),
  })
}

export function useRenameFolder() {
  return useOptimisticListMutation<Folder, RenameVars>({
    queryKey: foldersQueryOptions().queryKey,
    mutationFn: updateFolder,
    optimisticUpdate: (folders, { data }) =>
      patchById(folders, data.id, { name: data.name }),
  })
}

/**
 * Tier-1 destructive ("Move to trash"): no confirm dialog. Optimistically
 * prunes the folder's subtree (descendant folders + their drawings) from the
 * sidebar caches, shows an undo toast right away, and rolls back with an
 * error toast if the server call fails. Undo restores the whole unit in
 * place, optimistically.
 */
export function useTrashFolder() {
  const queryClient = useQueryClient()
  const foldersKey = foldersQueryOptions().queryKey
  const drawingsKey = drawingsQueryOptions().queryKey
  const invalidateBoth = () => {
    queryClient.invalidateQueries({ queryKey: foldersKey })
    queryClient.invalidateQueries({ queryKey: drawingsKey })
    // Key literal, not trashQueryOptions(): importing the trash feature here
    // would drag its server module into every consumer of these mutations.
    queryClient.invalidateQueries({ queryKey: ["trash"] })
  }

  const restoreMutation = useMutation({
    mutationFn: restoreFolder,
    onError: () => toast.error("Couldn't restore folder"),
    onSettled: invalidateBoth,
  })

  const trashMutation = useMutation({
    mutationFn: trashFolder,
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
    },
    onSettled: invalidateBoth,
  })

  return (folder: Folder) => {
    // Snapshot the unit before the optimistic prune — these rows (with their
    // parentId/folderId untouched) are exactly what undo puts back in place.
    const cachedFolders = queryClient.getQueryData<Folder[]>(foldersKey) ?? []
    const cachedDrawings =
      queryClient.getQueryData<Drawing[]>(drawingsKey) ?? []
    const subtree = collectFolderSubtreeIds(cachedFolders, folder.id)
    const removedFolders = cachedFolders.filter((f) => subtree.has(f.id))
    const removedDrawings = cachedDrawings.filter(
      (d) => d.folderId != null && subtree.has(d.folderId),
    )

    const trashed = trashMutation.mutateAsync({ data: folder.id })
    const toastId = toast("Moved to trash", {
      action: {
        label: "Undo",
        onClick: () => {
          // Wait out the in-flight trash call so restore can't race it
          // server-side; if trashing failed there is nothing to restore.
          trashed
            .then(() => {
              queryClient.setQueryData<Folder[]>(foldersKey, (list = []) => [
                ...list.filter(
                  (f) => !removedFolders.some((r) => r.id === f.id),
                ),
                ...removedFolders,
              ])
              queryClient.setQueryData<Drawing[]>(drawingsKey, (list = []) =>
                [
                  ...list.filter(
                    (d) => !removedDrawings.some((r) => r.id === d.id),
                  ),
                  ...removedDrawings,
                ].sort(
                  (a, b) =>
                    new Date(b.updatedAt).getTime() -
                    new Date(a.updatedAt).getTime(),
                ),
              )
              restoreMutation.mutate({ data: folder.id })
            })
            .catch(() => {})
        },
      },
    })
    trashed.catch(() => {
      toast.dismiss(toastId)
      toast.error("Couldn't move to trash")
    })
  }
}
