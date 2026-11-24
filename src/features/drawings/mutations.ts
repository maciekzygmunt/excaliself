import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import {
  patchById,
  removeById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { m } from "@/paraglide/messages"
import { type Drawing, drawingsQueryOptions } from "./queries"
import {
  createDrawing,
  duplicateDrawing,
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

type UpdateVars = Parameters<typeof updateDrawing>[0]

export function useCreateDrawing() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })
}

type DuplicateVars = {
  id: string
  /** Flushes the open canvas's last solo save, so the copy has it. */
  beforeDuplicate?: () => Promise<void>
}

/** The "Duplicate" menu action. The toast offers to open the copy. */
export function useDuplicateDrawing() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async ({ id, beforeDuplicate }: DuplicateVars) => {
      await beforeDuplicate?.()
      return duplicateDrawing({ data: id })
    },
    onSuccess: (copy) =>
      toast(m.drawings_duplicated({ name: copy.name }), {
        action: {
          label: m.drawings_open(),
          onClick: () => navigate({ to: "/draw/$id", params: { id: copy.id } }),
        },
      }),
    onError: () => toast.error(m.drawings_duplicate_failed()),
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })
}

export function useRenameDrawing() {
  return useOptimisticListMutation<Drawing, UpdateVars>({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      patchById(drawings, data.id, { name: data.updateData.name }),
    onRollback: () => toast.error(m.drawings_rename_failed()),
  })
}

export function useMoveDrawingToFolder() {
  return useOptimisticListMutation<Drawing, UpdateVars>({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      patchById(drawings, data.id, {
        folderId: data.updateData.folderId ?? null,
      }),
    onRollback: () => toast.error(m.drawings_move_failed()),
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
      toast.error(
        data.starred ? m.drawings_star_failed() : m.drawings_unstar_failed(),
      ),
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
    onError: () => toast.error(m.drawings_restore_failed()),
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
    const toastId = toast(m.trash_moved(), {
      action: {
        label: m.trash_undo(),
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
      toast.error(m.trash_move_failed())
    })
  }
}
