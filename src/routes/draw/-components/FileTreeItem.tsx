import { Link, useParams } from "@tanstack/react-router"
import {
  ChevronRight,
  File,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { type DragEvent, useEffect, useRef, useState } from "react"
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
  type DropTarget,
  type FolderType,
  type TreeNode,
  useSidebarContext,
} from "./SidebarContext"

type FolderItemProps = {
  folder: FolderType
  children: TreeNode[]
}

export function FolderItem({ folder, children: childNodes }: FolderItemProps) {
  const {
    dropTarget,
    dragItem,
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

  const [isExpanded, setIsExpanded] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)

  const hasChildren = childNodes.length > 0
  const isDropTarget =
    dropTarget?.type === "folder" &&
    dropTarget.id === folder.id &&
    dropTarget.position === "inside"
  const showDropHighlight = isDropTarget && dragItem?.id !== folder.id
  const isDragging = dragItem?.type === "folder" && dragItem.id === folder.id
  const showCreateRow = createDraft?.parentId === folder.id

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== folder.name) {
      onRename({ type: "folder", id: folder.id }, renameValue)
    }
    setIsRenaming(false)
  }

  // Auto-expand when creating inside this folder
  useEffect(() => {
    if (createDraft?.parentId === folder.id) {
      setIsExpanded(true)
    }
  }, [createDraft, folder.id])

  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  const handleDrop = (target: DropTarget) => (e: DragEvent) => {
    onDrop(target)(e)
    setIsExpanded(true)
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} asChild>
      <SidebarMenuItem
        className={cn(
          "rounded-md transition-colors",
          showDropHighlight && "bg-sidebar-accent ring-1 ring-sidebar-ring",
        )}
      >
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "group/folder-row relative flex w-full rounded-md transition-colors",
              isDragging && "opacity-50",
            )}
            onDragOver={onDragOver({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
            onDragLeave={onDragLeave}
            onDrop={handleDrop({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
          >
            <SidebarMenuButton
              draggable
              onDragStart={onDragStart({ type: "folder", id: folder.id })}
              onDragEnd={onDragEnd}
              className="cursor-pointer active:cursor-grabbing"
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
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameSubmit}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit()
                    if (e.key === "Escape") setIsRenaming(false)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 px-1 text-sm"
                />
              ) : (
                <span className="truncate">{folder.name}</span>
              )}
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  className="md:opacity-0 group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </SidebarMenuAction>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="right"
                align="start"
                onCloseAutoFocus={(event) => {
                  if (!pendingRenameFocus.current) return
                  event.preventDefault()
                  pendingRenameFocus.current = false
                  requestAnimationFrame(() => {
                    renameInputRef.current?.focus()
                    renameInputRef.current?.select()
                  })
                }}
              >
                <DropdownMenuItem
                  onClick={() => {
                    pendingRenameFocus.current = true
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
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub
            className="mr-0 pr-0"
            onDragOver={onDragOver({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
            onDragLeave={onDragLeave}
            onDrop={handleDrop({
              type: "folder",
              id: folder.id,
              position: "inside",
            })}
          >
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
            {childNodes.map((node) => (
              <TreeNodeItem
                key={node.type === "folder" ? node.folder.id : node.drawing.id}
                node={node}
              />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

type DrawingItemProps = {
  drawing: Drawing
}

export function DrawingItem({ drawing }: DrawingItemProps) {
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const { dragItem, onDragStart, onDragEnd, onDeleteDrawing, onRename } =
    useSidebarContext()

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(drawing.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)

  const isActive = drawing.id === currentDrawingId
  const isDragging = dragItem?.type === "drawing" && dragItem.id === drawing.id

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== drawing.name) {
      onRename({ type: "drawing", id: drawing.id }, renameValue)
    }
    setIsRenaming(false)
  }

  useEffect(() => {
    if (!isRenaming) return
    const frame = requestAnimationFrame(() => {
      renameInputRef.current?.focus()
      renameInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [isRenaming])

  const ButtonContent = (
    <>
      <File className="h-4 w-4 shrink-0" />
      {isRenaming ? (
        <Input
          ref={renameInputRef}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit()
            if (e.key === "Escape") setIsRenaming(false)
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-5 px-1 text-sm"
        />
      ) : (
        <span className="truncate">{drawing.name}</span>
      )}
    </>
  )

  return (
    <SidebarMenuItem
      className={cn("group/drawing-item", isDragging && "opacity-50")}
      draggable
      onDragStart={onDragStart({ type: "drawing", id: drawing.id })}
      onDragEnd={onDragEnd}
    >
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="cursor-pointer active:cursor-grabbing"
      >
        <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
          {ButtonContent}
        </Link>
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction className="md:opacity-0 group-hover/drawing-item:opacity-100 group-focus-within/drawing-item:opacity-100 data-[state=open]:opacity-100 peer-data-[active=true]/menu-button:text-sidebar-accent-foreground">
            <MoreHorizontal className="h-4 w-4" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          onCloseAutoFocus={(event) => {
            if (!pendingRenameFocus.current) return
            event.preventDefault()
            pendingRenameFocus.current = false
            requestAnimationFrame(() => {
              renameInputRef.current?.focus()
              renameInputRef.current?.select()
            })
          }}
        >
          <DropdownMenuItem
            onClick={() => {
              pendingRenameFocus.current = true
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

export function TreeNodeItem({ node }: { node: TreeNode }) {
  if (node.type === "folder") {
    return <FolderItem folder={node.folder} children={node.children} />
  }
  return <DrawingItem drawing={node.drawing} />
}
