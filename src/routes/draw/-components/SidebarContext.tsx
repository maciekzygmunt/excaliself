import type { DragEvent } from "react"
import { createContext, useContext } from "react"
import type { getDrawings } from "@/server/drawings"
import type { getFolders } from "@/server/folders"

export type Drawing = Awaited<ReturnType<typeof getDrawings>>[number]
export type FolderType = Awaited<ReturnType<typeof getFolders>>[number]

export type TreeItem =
  | { type: "drawing"; data: Drawing }
  | { type: "folder"; data: FolderType }

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
  folderChildren: Map<string | null, FolderType[]>
  drawingsByFolder: Map<string | null, Drawing[]>

  // UI state
  currentDrawingId: string
  expandedFolders: Set<string>
  toggleFolder: (id: string) => void
  dropTarget: DropTarget
  dragItem: DragItem | null

  // Confirm dialog
  confirmDialog: ConfirmDialog
  closeConfirmDialog: () => void

  // Create
  createDraft: { type: "drawing" | "folder"; parentId: string | null } | null
  createName: string
  setCreateName: (name: string) => void
  createInputRef: React.RefObject<HTMLInputElement | null>
  finalizeCreate: () => void
  cancelCreate: () => void
  startCreate: (type: "drawing" | "folder", parentId?: string | null) => void

  // Drag & drop
  onDragStart: (item: DragItem) => (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (target: DropTarget) => (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (target: DropTarget) => (e: DragEvent) => void

  // Actions
  onDeleteDrawing: (id: string) => void
  onDeleteFolder: (id: string) => void
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
