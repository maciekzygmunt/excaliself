import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { restoreDrawing } from "@/features/drawings/server"
import { foldersQueryOptions } from "@/features/folders/queries"
import { restoreFolder } from "@/features/folders/server"
import {
  type TrashedDrawing,
  type TrashedFolder,
  type TrashItems,
  trashQueryOptions,
} from "./queries"

const RESTORED_TO_ROOT_TOAST = "Restored to root — its folder no longer exists"

/**
 * Restore from the trash page (spec §5.11): the card vanishes optimistically
 * and rolls back with an error toast if the server call fails. The live
 * lists are invalidated so the item reappears where the server landed it;
 * when the original folder no longer exists the specified toast explains the
 * fallback to root.
 */
export function useRestoreTrashedDrawing() {
  const queryClient = useQueryClient()
  const trashKey = trashQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: restoreDrawing,
    onMutate: async ({ data: id }) => {
      await queryClient.cancelQueries({ queryKey: trashKey })
      const previous = queryClient.getQueryData<TrashItems>(trashKey)
      queryClient.setQueryData<TrashItems>(trashKey, (current) =>
        current
          ? {
              ...current,
              drawings: current.drawings.filter((d) => d.id !== id),
            }
          : current,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(trashKey, context?.previous)
      toast.error("Couldn't restore drawing")
    },
    onSuccess: (result) => {
      if (result.originalFolderGone) toast(RESTORED_TO_ROOT_TOAST)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trashKey })
      queryClient.invalidateQueries(drawingsQueryOptions())
    },
  })

  return (drawing: TrashedDrawing) => mutation.mutate({ data: drawing.id })
}

/** Folder variant of useRestoreTrashedDrawing: the unit comes back intact. */
export function useRestoreTrashedFolder() {
  const queryClient = useQueryClient()
  const trashKey = trashQueryOptions().queryKey

  const mutation = useMutation({
    mutationFn: restoreFolder,
    onMutate: async ({ data: id }) => {
      await queryClient.cancelQueries({ queryKey: trashKey })
      const previous = queryClient.getQueryData<TrashItems>(trashKey)
      queryClient.setQueryData<TrashItems>(trashKey, (current) =>
        current
          ? {
              ...current,
              folders: current.folders.filter((f) => f.id !== id),
            }
          : current,
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(trashKey, context?.previous)
      toast.error("Couldn't restore folder")
    },
    onSuccess: (result) => {
      if (result.originalParentGone) toast(RESTORED_TO_ROOT_TOAST)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: trashKey })
      queryClient.invalidateQueries(drawingsQueryOptions())
      queryClient.invalidateQueries(foldersQueryOptions())
    },
  })

  return (folder: TrashedFolder) => mutation.mutate({ data: folder.id })
}
