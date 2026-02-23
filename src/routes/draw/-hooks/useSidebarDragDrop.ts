import type { DragEvent } from "react"
import { useState } from "react"
import type {
  DragItem,
  Drawing,
  DropTarget,
  FolderType,
} from "../-components/SidebarContext"

type MutateFn<T> = { mutate: (variables: T) => void }

export function useSidebarDragDrop(opts: {
  drawings: Drawing[]
  folderById: Map<string, FolderType>
  moveDrawingMutation: MutateFn<{
    data: { id: string; updateData: { folderId: string | null } }
  }>
  moveFolderMutation: MutateFn<{
    data: { id: string; parentId: string | null }
  }>
}) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const isDescendant = (
    folderId: string,
    potentialParentId: string | null,
  ): boolean => {
    let id = potentialParentId
    while (id) {
      if (id === folderId) return true
      id = opts.folderById.get(id)?.parentId ?? null
    }
    return false
  }

  const onDragStart = (item: DragItem) => (e: DragEvent) => {
    setDragItem(item)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", item.id)
    e.dataTransfer.setData("application/x-sidebar-item", JSON.stringify(item))
  }

  const onDragEnd = () => {
    setDragItem(null)
    setDropTarget(null)
  }

  const onDragOver = (target: DropTarget) => (e: DragEvent) => {
    if (!dragItem) return

    if (
      dragItem.type === "folder" &&
      target?.type === "folder" &&
      (dragItem.id === target.id || isDescendant(dragItem.id, target.id))
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(target)
  }

  const onDragLeave = () => setDropTarget(null)

  const onDrop = (target: DropTarget) => async (e: DragEvent) => {
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
        isDescendant(dragItem.id, targetFolderId)
      ) {
        return
      }
      opts.moveFolderMutation.mutate({
        data: { id: dragItem.id, parentId: targetFolderId },
      })
    } else {
      const current = opts.drawings.find(
        (drawing) => drawing.id === dragItem.id,
      )
      if (current?.folderId === targetFolderId) return
      opts.moveDrawingMutation.mutate({
        data: { id: dragItem.id, updateData: { folderId: targetFolderId } },
      })
    }
  }

  return {
    dragItem,
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}
