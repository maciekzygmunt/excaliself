import { Link } from "@tanstack/react-router"
import {
  ChevronRight,
  File,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import {
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import {
  type Drawing,
  type FolderType,
  useSidebarContext,
} from "./SidebarContext"

type FolderItemProps = {
  folder: FolderType
}

export function FolderItem({ folder }: FolderItemProps) {
  const {
    expandedFolders,
    dropTarget,
    dragItem,
    folderChildren,
    drawingsByFolder,
    toggleFolder,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onDeleteFolder,
    onRename,
    createDraft,
    createName,
    setCreateName,
    createInputRef,
    finalizeCreate,
    cancelCreate,
  } = useSidebarContext()

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)

  const childFolders = folderChildren.get(folder.id) ?? []
  const folderDrawings = drawingsByFolder.get(folder.id) ?? []
  const isExpanded = expandedFolders.has(folder.id)
  const hasChildren = childFolders.length > 0 || folderDrawings.length > 0
  const isDropTarget =
    dropTarget?.type === "folder" &&
    dropTarget.id === folder.id &&
    dropTarget.position === "inside"
  const isDragging = dragItem?.type === "folder" && dragItem.id === folder.id
  const showCreateRow = createDraft?.parentId === folder.id

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== folder.name) {
      onRename({ type: "folder", id: folder.id }, renameValue)
    }
    setIsRenaming(false)
  }

  return (
    <Collapsible
      open={isExpanded}
      onOpenChange={() => toggleFolder(folder.id)}
      asChild
    >
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
          <div
            className={cn(
              "flex w-full rounded-md transition-colors",
              isDropTarget && "bg-sidebar-accent ring-2 ring-sidebar-ring",
              isDragging && "opacity-50",
            )}
            onDragOver={onDragOver({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
            onDragLeave={onDragLeave}
            onDrop={onDrop({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
          >
            <SidebarMenuButton
              draggable
              onDragStart={onDragStart({ type: "folder", id: folder.id })}
              onDragEnd={onDragEnd}
              className="cursor-grab active:cursor-grabbing"
            >
              <ChevronRight
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform duration-200",
                  isExpanded && "rotate-90",
                  !hasChildren && "opacity-0",
                )}
              />
              <Folder className="h-4 w-4 shrink-0" />
              {isRenaming ? (
                <Input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit()
                    if (e.key === "Escape") setIsRenaming(false)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  autoFocus
                  className="h-5 px-1 text-sm"
                />
              ) : (
                <span className="truncate">{folder.name}</span>
              )}
            </SidebarMenuButton>
          </div>
        </CollapsibleTrigger>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover>
              <MoreHorizontal className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem
              onClick={() => {
                setRenameValue(folder.name)
                setIsRenaming(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteFolder(folder.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <CollapsibleContent>
          <SidebarMenuSub>
            {showCreateRow && (
              <CreateRow
                type={createDraft.type}
                name={createName}
                onNameChange={setCreateName}
                inputRef={createInputRef}
                onSubmit={finalizeCreate}
                onCancel={cancelCreate}
              />
            )}
            {childFolders.map((child) => (
              <FolderItem key={child.id} folder={child} />
            ))}
            {folderDrawings.map((drawing) => (
              <DrawingItem key={drawing.id} drawing={drawing} isNested />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

type DrawingItemProps = {
  drawing: Drawing
  isNested?: boolean
}

export function DrawingItem({ drawing, isNested }: DrawingItemProps) {
  const {
    currentDrawingId,
    dragItem,
    onDragStart,
    onDragEnd,
    onDeleteDrawing,
    onRename,
  } = useSidebarContext()

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(drawing.name)

  const isActive = drawing.id === currentDrawingId
  const isDragging = dragItem?.type === "drawing" && dragItem.id === drawing.id

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== drawing.name) {
      onRename({ type: "drawing", id: drawing.id }, renameValue)
    }
    setIsRenaming(false)
  }

  const ButtonContent = (
    <>
      <File className="h-4 w-4 shrink-0" />
      {isRenaming ? (
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit()
            if (e.key === "Escape") setIsRenaming(false)
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
          className="h-5 px-1 text-sm"
        />
      ) : (
        <span className="truncate">{drawing.name}</span>
      )}
    </>
  )

  if (isNested) {
    return (
      <SidebarMenuItem
        className={cn(isDragging && "opacity-50")}
        draggable
        onDragStart={onDragStart({ type: "drawing", id: drawing.id })}
        onDragEnd={onDragEnd}
      >
        <SidebarMenuButton
          asChild
          isActive={isActive}
          className="cursor-grab active:cursor-grabbing"
        >
          <Link to="/draw/$id" params={{ id: drawing.id }}>
            {ButtonContent}
          </Link>
        </SidebarMenuButton>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover>
              <MoreHorizontal className="h-4 w-4" />
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="right" align="start">
            <DropdownMenuItem
              onClick={() => {
                setRenameValue(drawing.name)
                setIsRenaming(true)
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              Rename
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDeleteDrawing(drawing.id)}
              className="text-destructive focus:text-destructive"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    )
  }

  return (
    <SidebarMenuItem
      className={cn(isDragging && "opacity-50")}
      draggable
      onDragStart={onDragStart({ type: "drawing", id: drawing.id })}
      onDragEnd={onDragEnd}
    >
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="cursor-grab active:cursor-grabbing"
      >
        <Link to="/draw/$id" params={{ id: drawing.id }}>
          {ButtonContent}
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction showOnHover>
            <MoreHorizontal className="h-4 w-4" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="right" align="start">
          <DropdownMenuItem
            onClick={() => {
              setRenameValue(drawing.name)
              setIsRenaming(true)
            }}
          >
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => onDeleteDrawing(drawing.id)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  )
}

type CreateRowProps = {
  type: "drawing" | "folder"
  name: string
  onNameChange: (name: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onSubmit: () => void
  onCancel: () => void
}

export function CreateRow({
  type,
  name,
  onNameChange,
  inputRef,
  onSubmit,
  onCancel,
}: CreateRowProps) {
  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-2 py-1">
        {type === "folder" ? (
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          onBlur={onSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              onSubmit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              onCancel()
            }
          }}
          className="h-6 flex-1 px-2 text-sm"
        />
      </div>
    </SidebarMenuItem>
  )
}
