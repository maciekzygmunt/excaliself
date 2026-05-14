import {
  createContext,
  type DragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"
import type { Drawing } from "@/features/drawings/queries"
import { updateDrawing } from "@/features/drawings/server"
import type { Folder } from "@/features/folders/queries"
import { updateFolder } from "@/features/folders/server"
import {
  patchById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { isDescendantFolder } from "./tree"

export type DragItem = { type: "drawing" | "folder"; id: string }
export type DropTarget =
  | { type: "root" }
  | { type: "folder"; id: string; position: "inside" | "above" | "below" }
  | null

type Options = {
  drawings: Drawing[]
  foldersById: Map<string, Folder>
}

function useSidebarDnDValue({ drawings, foldersById }: Options) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const moveDrawing = useOptimisticListMutation<
    Drawing,
    Parameters<typeof updateDrawing>[0]
  >({
    queryKey: ["drawings"],
    mutationFn: updateDrawing,
    optimisticUpdate: (list, { data }) =>
      patchById(list, data.id, { folderId: data.updateData.folderId }),
  })

  const moveFolder = useOptimisticListMutation<
    Folder,
    Parameters<typeof updateFolder>[0]
  >({
    queryKey: ["folders"],
    mutationFn: updateFolder,
    optimisticUpdate: (list, { data }) =>
      patchById(list, data.id, { parentId: data.parentId }),
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
    dragItem,
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  }
}

export type SidebarDnD = ReturnType<typeof useSidebarDnDValue>

const SidebarDnDContext = createContext<SidebarDnD | null>(null)

export function SidebarDnDProvider({
  drawings,
  foldersById,
  children,
}: Options & { children: ReactNode }) {
  const value = useSidebarDnDValue({ drawings, foldersById })
  return (
    <SidebarDnDContext.Provider value={value}>
      {children}
    </SidebarDnDContext.Provider>
  )
}

export function useSidebarDnD() {
  const ctx = useContext(SidebarDnDContext)
  if (!ctx)
    throw new Error("useSidebarDnD must be used inside SidebarDnDProvider")
  return ctx
}
