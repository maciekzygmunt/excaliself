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
  deleteDrawing,
  setDrawingStarred,
  updateDrawing,
} from "./server"

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

export function useDeleteDrawing() {
  return useOptimisticListMutation<
    Drawing,
    Parameters<typeof deleteDrawing>[0]
  >({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: deleteDrawing,
    optimisticUpdate: (drawings, { data: id }) => removeById(drawings, id),
  })
}
