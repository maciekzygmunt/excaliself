import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { createDrawing, deleteDrawing } from "@/server/drawings"
import { deleteFolder } from "@/server/folders"
import type { Drawing } from "./tree"

export type ConfirmDialog = {
  title: string
  description: string
  onConfirm: () => void | Promise<void>
} | null

type Options = {
  drawings: Drawing[]
}

export function useSidebarActions({ drawings }: Options) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })

  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)
  const closeConfirmDialog = useCallback(() => setConfirmDialog(null), [])

  const deleteDrawingMutation = useOptimisticListMutation<
    Drawing,
    Parameters<typeof deleteDrawing>[0]
  >({
    queryKey: ["drawings"],
    mutationFn: deleteDrawing,
    optimisticUpdate: (drawings, { data: id }) =>
      drawings.filter((d) => d.id !== id),
  })

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
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
      queryClient.invalidateQueries({ queryKey: ["folders"] })
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const onDeleteDrawing = useCallback(
    (id: string) => {
      setConfirmDialog({
        title: "Delete drawing?",
        description: "Are you sure you want to delete this drawing?",
        onConfirm: async () => {
          await deleteDrawingMutation.mutateAsync({ data: id })
          if (id !== currentDrawingId) return

          const remaining = drawings.filter((d) => d.id !== id)
          if (remaining.length > 0) {
            navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
            return
          }
          const newId = await createDrawingMutation.mutateAsync({ data: {} })
          navigate({ to: "/draw/$id", params: { id: newId } })
        },
      })
    },
    [
      createDrawingMutation,
      currentDrawingId,
      deleteDrawingMutation,
      drawings,
      navigate,
    ],
  )

  const onDeleteFolder = useCallback(
    (id: string, hasChildren: boolean) => {
      setConfirmDialog({
        title: "Delete folder?",
        description: hasChildren
          ? "This folder contains items. All files in this folder will be deleted."
          : "Delete this folder?",
        onConfirm: () => {
          deleteFolderMutation.mutate({ data: id })
        },
      })
    },
    [deleteFolderMutation],
  )

  return {
    onDeleteDrawing,
    onDeleteFolder,
    confirmDialog,
    closeConfirmDialog,
  }
}
