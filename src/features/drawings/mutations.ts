import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { type Drawing, drawingsQueryOptions } from "./queries"
import { updateDrawing } from "./server"

type RenameVars = Parameters<typeof updateDrawing>[0]

export function useRenameDrawing() {
  return useOptimisticListMutation<Drawing, RenameVars>({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      drawings.map((d) =>
        d.id === data.id ? { ...d, name: data.updateData.name ?? d.name } : d,
      ),
  })
}
