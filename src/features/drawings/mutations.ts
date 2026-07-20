import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  patchById,
  removeById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { type Drawing, drawingsQueryOptions } from "./queries"
import {
  createDrawing,
  restoreDrawing,
  setDrawingStarred,
  trashDrawing,
  updateDrawing,
} from "./server"

/** Re-inserts a drawing where the recency-ordered server list would put it. */
export function insertByRecency(list: Drawing[], drawing: Drawing): Drawing[] {
  return [...list.filter((d) => d.id !== drawing.id), drawing].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )
}

type RenameVars = Parameters<typeof updateDrawing>[0]

export function useCreateDrawing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })
}

export function useRenameDrawing() {
  return useOptimisticListMutation<Drawing, RenameVars>({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      patchById(drawings, data.id, { name: data.updateData.name }),
  })
}

export function useToggleStarDrawing() {
  return useOptimisticListMutation<
    Drawing,
    Parameters<typeof setDrawingStarred>[0]
  >({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: setDrawingStarred,
    optimisticUpdate: (drawings, { data }) =>
      patchById(drawings, data.id, { starred: data.starred }),
    onRollback: ({ data }) =>
      toast.error(data.starred ? "Failed to star" : "Failed to unstar"),
  })
}

/**
 * Tier-1 destructive ("Move to trash"): no confirm dialog. The drawing
 * vanishes from the cache instantly and an undo toast appears right away;
 * on server failure the toast is swapped for an error and the cache rolls
 * back. Undo restores the drawing in place, optimistically.
 */
export function useTrashDrawing() {
  const queryClient = useQueryClient()
  const queryKey = drawingsQueryOptions().queryKey
  // Key literal, not trashQueryOptions(): importing the trash feature here
  // would drag its server module into every consumer of these mutations.
  const invalidateTrash = () =>
    queryClient.invalidateQueries({ queryKey: ["trash"] })

  const restoreMutation = useMutation({
    mutationFn: restoreDrawing,
    onError: () => toast.error("Couldn't restore drawing"),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey })
      invalidateTrash()
    },
  })

  const trashMutation = useOptimisticListMutation<
    Drawing,
    Parameters<typeof trashDrawing>[0]
  >({
    queryKey,
    mutationFn: trashDrawing,
    optimisticUpdate: (drawings, { data: id }) => removeById(drawings, id),
  })

  return (drawing: Drawing) => {
    const trashed = trashMutation.mutateAsync({ data: drawing.id })
    trashed.then(invalidateTrash, () => {})
    const toastId = toast("Moved to trash", {
      action: {
        label: "Undo",
        onClick: () => {
          // Wait out the in-flight trash call so restore can't race it
          // server-side; if trashing failed there is nothing to restore.
          trashed
            .then(() => {
              queryClient.setQueryData<Drawing[]>(queryKey, (list = []) =>
                insertByRecency(list, drawing),
              )
              restoreMutation.mutate({ data: drawing.id })
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
