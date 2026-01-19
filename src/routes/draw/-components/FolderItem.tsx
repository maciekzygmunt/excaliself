import { ChevronRight, Folder } from "lucide-react"
import { cn } from "@/lib/utils"
import { CreateRow } from "./CreateRow"
import { DrawingItem } from "./DrawingItem"
import { type FolderType, useSidebarContext } from "./SidebarContext"

type FolderItemProps = {
  folder: FolderType
  depth: number
}

export function FolderItem({ folder, depth }: FolderItemProps) {
  const {
    expandedFolders,
    activeFolderId,
    dropTarget,
    open,
    folderChildren,
    drawingsByFolder,
    toggleFolder,
    setActiveFolderId,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useSidebarContext()

  const childFolders = folderChildren.get(folder.id) ?? []
  const folderDrawings = drawingsByFolder.get(folder.id) ?? []
  const isExpanded = expandedFolders.has(folder.id)
  const isActive = activeFolderId === folder.id
  const hasChildren = childFolders.length > 0 || folderDrawings.length > 0
  const isDropTarget = dropTarget?.type === "folder" && dropTarget.id === folder.id
  const dropTargetForFolder = { type: "folder" as const, id: folder.id }

  return (
    <div
      className={cn(
        "rounded-md border border-transparent transition-colors",
        isDropTarget && "bg-accent/30 ring-1 ring-primary/30",
      )}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
      <div
        className="flex w-full items-center gap-0.5 rounded-md py-0.5"
        style={open ? { paddingLeft: depth * 12 + 4 } : undefined}
        onDragOver={onDragOver(dropTargetForFolder)}
        onDragLeave={onDragLeave}
        onDrop={onDrop(dropTargetForFolder)}
      >
        <button
          type="button"
          onClick={() => toggleFolder(folder.id)}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            !hasChildren && "opacity-30",
          )}
          disabled={!hasChildren}
        >
          <ChevronRight
            className={cn("h-3.5 w-3.5 transition-transform", isExpanded && "rotate-90")}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveFolderId(folder.id)
            toggleFolder(folder.id)
          }}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            !open && "justify-center px-0",
          )}
          draggable={open}
          onDragStart={onDragStart({ type: "folder", id: folder.id })}
          onDragEnd={onDragEnd}
        >
          <Folder className="h-4 w-4 shrink-0" />
          {open && <span className="truncate">{folder.name}</span>}
        </button>
      </div>
      {isExpanded && (
        /* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */
        <div
          className="ml-3 border-l border-border/40 pl-1"
          onDragOver={onDragOver(dropTargetForFolder)}
          onDragLeave={onDragLeave}
          onDrop={onDrop(dropTargetForFolder)}
        >
          <CreateRow depth={depth + 1} parentId={folder.id} />
          {childFolders.map((child) => (
            <FolderItem key={child.id} folder={child} depth={depth + 1} />
          ))}
          {folderDrawings.map((item) => (
            <DrawingItem key={item.id} item={item} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  )
}
