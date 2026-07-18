import {
  patchById,
  removeById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { type Drawing, drawingsQueryOptions } from "./queries"
import { deleteDrawing, updateDrawing } from "./server"

type RenameVars = Parameters<typeof updateDrawing>[0]

export function useRenameDrawing() {
  return useOptimisticListMutation<Drawing, RenameVars>({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      patchById(drawings, data.id, { name: data.updateData.name }),
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
