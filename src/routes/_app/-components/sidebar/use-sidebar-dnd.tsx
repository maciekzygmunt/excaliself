import {
  createContext,
  type DragEvent,
  type ReactNode,
  useCallback,
  useContext,
  useState,
} from "react"
import { type Drawing, drawingsQueryOptions } from "@/features/drawings/queries"
import { updateDrawing } from "@/features/drawings/server"
import { type Folder, foldersQueryOptions } from "@/features/folders/queries"
import { updateFolder } from "@/features/folders/server"
import {
  patchById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { useMoveToTeamDialog } from "../MoveToTeamDialog"
import { canDrop, type DragItem, type DropTarget } from "./tree"

const sameTarget = (a: DropTarget | null, b: DropTarget) =>
  a !== null &&
  a.type === b.type &&
  a.space === b.space &&
  (a.type !== "folder" || b.type !== "folder" || a.id === b.id)

type Options = {
  drawings: Drawing[]
  foldersById: Map<string, Folder>
}

function useSidebarDnDValue({ drawings, foldersById }: Options) {
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const { requestMoveToTeam } = useMoveToTeamDialog()

  const moveDrawing = useOptimisticListMutation<
    Drawing,
    Parameters<typeof updateDrawing>[0]
  >({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: updateDrawing,
    optimisticUpdate: (list, { data }) =>
      patchById(list, data.id, { folderId: data.updateData.folderId }),
  })

  const moveFolder = useOptimisticListMutation<
    Folder,
    Parameters<typeof updateFolder>[0]
  >({
    queryKey: foldersQueryOptions().queryKey,
    mutationFn: updateFolder,
    optimisticUpdate: (list, { data }) =>
      patchById(list, data.id, { parentId: data.parentId }),
  })

  const isAllowed = useCallback(
    (item: DragItem, target: DropTarget) => canDrop(item, target, foldersById),
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
      if (!dragItem || !isAllowed(dragItem, target)) return
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      // dragover fires continuously; keep the old object so nothing re-renders.
      setDropTarget((prev) => (sameTarget(prev, target) ? prev : target))
    },
    [dragItem, isAllowed],
  )

  const onDragLeave = useCallback(() => setDropTarget(null), [])

  const onDrop = useCallback(
    (target: DropTarget) => (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      if (!dragItem) return

      const targetFolderId = target.type === "folder" ? target.id : null

      setDropTarget(null)
      setDragItem(null)

      if (!isAllowed(dragItem, target)) return

      // Private → Team: never silent, always through the confirm.
      if (dragItem.space !== target.space) {
        const name =
          dragItem.type === "drawing"
            ? drawings.find((d) => d.id === dragItem.id)?.name
            : foldersById.get(dragItem.id)?.name
        requestMoveToTeam?.(
          { type: dragItem.type, id: dragItem.id },
          name ?? "",
          targetFolderId,
        )
        return
      }

      if (dragItem.type === "folder") {
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
    [
      dragItem,
      drawings,
      foldersById,
      isAllowed,
      requestMoveToTeam,
      moveDrawing,
      moveFolder,
    ],
  )

  return {
    dragItem,
    dropTarget,
    canDrop: isAllowed,
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
