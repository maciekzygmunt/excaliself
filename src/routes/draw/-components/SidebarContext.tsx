import type { DragEvent } from "react"
import { createContext, useContext } from "react"
import type { getDrawings } from "@/server/drawings"
import type { getFolders } from "@/server/folders"

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
  onRename: (item: DragItem, newName: string) => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarContextProvider({
  children,
  value,
}: {
  children: React.ReactNode
  value: SidebarContextValue
}) {
  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
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
