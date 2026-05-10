import { type DragEvent, useCallback, useState } from "react"
import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { updateDrawing } from "@/server/drawings"
import { updateFolder } from "@/server/folders"
import {
  type DragItem,
  type Drawing,
  type DropTarget,
  type FolderType,
  isDescendantFolder,
} from "./tree"

type Options = {
  drawings: Drawing[]
  foldersById: Map<string, FolderType>
}

export function useSidebarDragDrop({ drawings, foldersById }: Options) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const moveDrawing = useOptimisticListMutation<
    Drawing,
    Parameters<typeof updateDrawing>[0]
  >({
    queryKey: ["drawings"],
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      drawings.map((d) =>
        d.id === data.id
          ? { ...d, folderId: data.updateData.folderId ?? d.folderId }
          : d,
      ),
  })

  const moveFolder = useOptimisticListMutation<
    FolderType,
    Parameters<typeof updateFolder>[0]
  >({
    queryKey: ["folders"],
    mutationFn: updateFolder,
    optimisticUpdate: (folders, { data }) =>
      folders.map((f) =>
        f.id === data.id ? { ...f, parentId: data.parentId ?? f.parentId } : f,
      ),
  })

  const isInvalidFolderTarget = useCallback(
    (item: DragItem, target: DropTarget) =>
      item.type === "folder" &&
      target?.type === "folder" &&
      (item.id === target.id ||
        isDescendantFolder(item.id, target.id, foldersById)),
    [foldersById],
  )

  const onDragStart = useCallback(
    (item: DragItem) => (e: DragEvent) => {
      setDragItem(item)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", item.id)
      e.dataTransfer.setData("application/x-sidebar-item", JSON.stringify(item))
    },
    [],
  )

  const onDragEnd = useCallback(() => {
    setDragItem(null)
    setDropTarget(null)
  }, [])

  const onDragOver = useCallback(
    (target: DropTarget) => (e: DragEvent) => {
      if (!dragItem || isInvalidFolderTarget(dragItem, target)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDropTarget(target)
    },
    [dragItem, isInvalidFolderTarget],
  )

  const onDragLeave = useCallback(() => setDropTarget(null), [])

  const onDrop = useCallback(
    (target: DropTarget) => (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      if (!dragItem) return

      const targetFolderId =
        target?.type === "folder" && target.position === "inside"
          ? target.id
          : null

      setDropTarget(null)
      setDragItem(null)

      if (dragItem.type === "folder") {
        if (
          targetFolderId === dragItem.id ||
          isDescendantFolder(dragItem.id, targetFolderId, foldersById)
        ) {
          return
        }
        moveFolder.mutate({
          data: { id: dragItem.id, parentId: targetFolderId },
        })
        return
      }

      const current = drawings.find((d) => d.id === dragItem.id)
      if (current?.folderId === targetFolderId) return
      moveDrawing.mutate({
        data: { id: dragItem.id, updateData: { folderId: targetFolderId } },
      })
    },
    [dragItem, drawings, foldersById, moveDrawing, moveFolder],
  )

  return {
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}
