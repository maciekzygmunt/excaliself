import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"
import type { DragEvent } from "react"
import { createContext, useContext, useMemo, useState } from "react"
import { optimisticListMutation } from "@/lib/optimistic-mutation"
import { queryKeys } from "@/lib/query-keys"
import { getDrawings, updateDrawing } from "@/server/drawings"
import { getFolders, updateFolder } from "@/server/folders"
import { useSidebarDelete } from "../-hooks/useSidebarDelete"
import { useSidebarDragDrop } from "../-hooks/useSidebarDragDrop"
import { buildFileTree, filterTree } from "../-utils/buildTree"

export type Drawing = Awaited<ReturnType<typeof getDrawings>>[number]
export type FolderType = Awaited<ReturnType<typeof getFolders>>[number]

export type TreeNode =
  | { type: "folder"; folder: FolderType; children: TreeNode[] }
  | { type: "drawing"; drawing: Drawing }

export type DragItem = { type: "drawing" | "folder"; id: string }
export type DropTarget =
  | { type: "root" }
  | { type: "folder"; id: string; position: "inside" | "above" | "below" }
  | null

export type ConfirmDialog = {
  title: string
  description: string
  onConfirm: () => void | Promise<void>
} | null

export type SidebarContextValue = {
  // Data
  tree: TreeNode[]
  filteredTree: TreeNode[]

  // Search
  searchQuery: string
  setSearchQuery: (query: string) => void

  // UI state
  dropTarget: DropTarget

  // Drag & drop
  onDragStart: (item: DragItem) => (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (target: DropTarget) => (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (target: DropTarget) => (e: DragEvent) => void

  // Actions
  onDeleteDrawing: (id: string) => void
  onDeleteFolder: (id: string, hasChildren: boolean) => void

  // Dialog
  confirmDialog: ConfirmDialog
  showConfirmDialog: (dialog: NonNullable<ConfirmDialog>) => void
  closeConfirmDialog: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarContextProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })

  // --- Data fetching ---
  const { data: drawings = [] } = useQuery({
    queryKey: queryKeys.drawings(),
    queryFn: () => getDrawings(),
  })
  const { data: folders = [] } = useQuery({
    queryKey: queryKeys.folders(),
    queryFn: () => getFolders(),
  })

  // --- UI state ---
  const [searchQuery, setSearchQuery] = useState("")
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  // --- Derived data ---
  const folderById = useMemo(
    () => new Map(folders.map((folder) => [folder.id, folder])),
    [folders],
  )

  const tree = useMemo(
    () => buildFileTree(drawings, folders),
    [drawings, folders],
  )

  const filteredTree = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    if (!q) return tree
    return filterTree(drawings, searchQuery)
  }, [searchQuery, tree, drawings])

  // --- Move mutations ---
  const moveDrawingMutation = useMutation({
    mutationFn: updateDrawing,
    ...optimisticListMutation<
      Drawing,
      { data: { id: string; updateData: { folderId: string | null } } }
    >({
      queryClient,
      queryKey: queryKeys.drawings(),
      updateFn: (items, variables) =>
        items.map((drawing) =>
          drawing.id === variables.data.id
            ? {
                ...drawing,
                folderId:
                  variables.data.updateData.folderId ?? drawing.folderId,
              }
            : drawing,
        ),
    }),
  })

  const moveFolderMutation = useMutation({
    mutationFn: updateFolder,
    ...optimisticListMutation<
      FolderType,
      { data: { id: string; parentId: string | null } }
    >({
      queryClient,
      queryKey: queryKeys.folders(),
      updateFn: (items, variables) =>
        items.map((folder) =>
          folder.id === variables.data.id
            ? {
                ...folder,
                parentId: variables.data.parentId ?? folder.parentId,
              }
            : folder,
        ),
    }),
  })

  // --- Drag & drop ---
  const {
    dragItem: _,
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useSidebarDragDrop({
    drawings,
    folderById,
    moveDrawingMutation,
    moveFolderMutation,
  })

  // --- Delete handlers ---
  const { onDeleteDrawing, onDeleteFolder } = useSidebarDelete({
    drawings,
    currentDrawingId,
    setConfirmDialog,
  })

  // --- Dialog methods ---
  const showConfirmDialog = (dialog: NonNullable<ConfirmDialog>) => {
    setConfirmDialog(dialog)
  }

  const closeConfirmDialog = () => {
    setConfirmDialog(null)
  }

  return (
    <SidebarContext.Provider
      value={{
        tree,
        filteredTree,
        searchQuery,
        setSearchQuery,
        dropTarget,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
        onDeleteDrawing,
        onDeleteFolder,
        confirmDialog,
        showConfirmDialog,
        closeConfirmDialog,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error(
      "useSidebarContext must be used within SidebarContextProvider",
    )
  }
  return context
}
