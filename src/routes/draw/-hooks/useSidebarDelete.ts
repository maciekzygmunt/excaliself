import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"
import { optimisticListMutation } from "@/lib/optimistic-mutation"
import { queryKeys } from "@/lib/query-keys"
import { createDrawing, deleteDrawing } from "@/server/drawings"
import { deleteFolder } from "@/server/folders"
import type { ConfirmDialog, Drawing } from "../-components/SidebarContext"

export function useSidebarDelete(opts: {
  drawings: Drawing[]
  currentDrawingId: string
  setConfirmDialog: (dialog: ConfirmDialog) => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const deleteDrawingMutation = useMutation({
    mutationFn: deleteDrawing,
    ...optimisticListMutation<Drawing, { data: string }>({
      queryClient,
      queryKey: queryKeys.drawings(),
      updateFn: (items, variables) =>
        items.filter((drawing) => drawing.id !== variables.data),
    }),
  })

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drawings() })
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onMutate: () => {
      toast.loading("Deleting folder...", { id: "delete-folder" })
    },
    onError: () => {
      toast.error("Failed to delete folder", { id: "delete-folder" })
    },
    onSuccess: () => {
      toast.success("Folder deleted", { id: "delete-folder" })
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders() })
      queryClient.invalidateQueries({ queryKey: queryKeys.drawings() })
    },
  })

  const onDeleteDrawing = (id: string) => {
    opts.setConfirmDialog({
      title: "Delete drawing?",
      description: "Are you sure you want to delete this drawing?",
      onConfirm: async () => {
        await deleteDrawingMutation.mutateAsync({ data: id })

        if (id === opts.currentDrawingId) {
          const remaining = opts.drawings.filter((drawing) => drawing.id !== id)
          if (remaining.length > 0) {
            navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
          } else {
            const newId = await createDrawingMutation.mutateAsync({
              data: {},
            })
            navigate({ to: "/draw/$id", params: { id: newId } })
          }
        }
      },
    })
  }

  const onDeleteFolder = (id: string, hasChildren: boolean) => {
    opts.setConfirmDialog({
      title: "Delete folder?",
      description: hasChildren
        ? "This folder contains items. All files in this folder will be deleted."
        : "Delete this folder?",
      onConfirm: () => {
        deleteFolderMutation.mutate({ data: id })
      },
    })
  }

  return { onDeleteDrawing, onDeleteFolder }
}
