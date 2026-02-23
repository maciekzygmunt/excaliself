import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import {
  ChevronRight,
  File,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { type DragEvent, useCallback, useEffect, useRef, useState } from "react"
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
import { optimisticListMutation } from "@/lib/optimistic-mutation"
import { queryKeys } from "@/lib/query-keys"
import { cn } from "@/lib/utils"
import { createDrawing, updateDrawing } from "@/server/drawings"
import { createFolder, updateFolder } from "@/server/folders"
import { useRename } from "../-hooks/useRename"
import { hasActiveDrawing } from "../-utils/hasActiveDrawing"
import {
  type Drawing,
  type DropTarget,
  type FolderType,
  type TreeNode,
  useSidebarContext,
} from "./SidebarContext"

// Shared dropdown menu component
type ItemDropdownMenuProps = {
  groupClass: string
  isRenaming: boolean
  onStartRename: () => void
  onDelete: () => void
  onCloseAutoFocus: (event: Event) => void
}

function ItemDropdownMenu({
  groupClass,
  isRenaming,
  onStartRename,
  onDelete,
  onCloseAutoFocus,
}: ItemDropdownMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuAction
          className={cn(
            `text-muted-foreground/30 md:opacity-0 ${groupClass} data-[state=open]:opacity-100 [&>svg]:size-auto`,
            isRenaming && "hidden",
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-[14px]! w-[14px]!" />
        </SidebarMenuAction>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="right"
        align="start"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DropdownMenuItem onClick={onStartRename}>
          <Pencil className="mr-2 h-4 w-4" />
          Rename
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          className="text-destructive focus:text-destructive"
        >
          <Trash2 className="mr-2 h-4 w-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// FolderItem
type FolderItemProps = {
  folder: FolderType
  children: TreeNode[]
}

export function FolderItem({ folder, children: childNodes }: FolderItemProps) {
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const {
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
    onDeleteFolder,
  } = useSidebarContext()

  const queryClient = useQueryClient()
  const renameMutation = useMutation({
    mutationFn: updateFolder,
    ...optimisticListMutation<
      FolderType,
      { data: { id: string; name?: string; parentId?: string | null } }
    >({
      queryClient,
      queryKey: queryKeys.folders(),
      updateFn: (items, variables) =>
        items.map((folder) =>
          folder.id === variables.data.id
            ? { ...folder, name: variables.data.name ?? folder.name }
            : folder,
        ),
    }),
  })

  const handleFolderRename = useCallback(
    (newName: string) => {
      renameMutation.mutate({
        data: { id: folder.id, name: newName },
      })
    },
    [folder.id, renameMutation],
  )

  const {
    isRenaming,
    renameValue,
    setRenameValue,
    refs,
    startRenaming,
    cancelRenaming,
    handleRenameSubmit,
    handleRenameBlur,
    handleDropdownCloseAutoFocus,
  } = useRename({
    currentName: folder.name,
    onRename: handleFolderRename,
  })

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)
  const [isDragging, setIsDragging] = useState(false)

  const hasChildren = childNodes.length > 0
  const showDropHighlight =
    dropTarget?.type === "folder" &&
    dropTarget.id === folder.id &&
    dropTarget.position === "inside"

  const handleDragStart = (e: DragEvent) => {
    onDragStart({ type: "folder", id: folder.id })(e)
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    onDragEnd()
    setIsDragging(false)
  }

  const handleDrop = (target: DropTarget) => (e: DragEvent) => {
    onDrop(target)(e)
    setIsExpanded(true)
  }

  const dropTargetProps = {
    onDragOver: onDragOver({
      type: "folder" as const,
      id: folder.id,
      position: "inside" as const,
    }),
    onDragLeave,
    onDrop: handleDrop({
      type: "folder",
      id: folder.id,
      position: "inside",
    }),
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={setIsExpanded} asChild>
      <SidebarMenuItem
        className={cn(
          "rounded-md transition-colors",
          showDropHighlight &&
            "bg-notion-terracotta-muted ring-1 ring-notion-terracotta/20",
        )}
      >
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "group/folder-row relative flex w-full rounded-md transition-colors",
              isDragging && "opacity-50",
            )}
            {...dropTargetProps}
          >
            <SidebarMenuButton
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={cn(
                "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! active:cursor-grabbing [&>svg]:size-auto",
                isRenaming && "pr-3!",
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3! w-3! shrink-0 text-muted-foreground/40 transition-transform duration-150",
                  isExpanded && "rotate-90",
                  !hasChildren && "opacity-0",
                )}
              />
              <Folder className="h-[14px]! w-[14px]! shrink-0 text-notion-gold" />
              {isRenaming ? (
                <Input
                  ref={(el) => {
                    refs.current.input = el
                  }}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={handleRenameBlur}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleRenameSubmit()
                    if (e.key === "Escape") cancelRenaming()
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="h-5 rounded px-1 text-sm"
                />
              ) : (
                <span className="truncate text-sidebar-foreground/70">
                  {folder.name}
                </span>
              )}
            </SidebarMenuButton>
            <ItemDropdownMenu
              groupClass="group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100"
              isRenaming={isRenaming}
              onStartRename={startRenaming}
              onDelete={() => onDeleteFolder(folder.id, hasChildren)}
              onCloseAutoFocus={handleDropdownCloseAutoFocus}
            />
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub
            className="ml-3 mr-0 gap-0 border-sidebar-border/50 pl-2 pr-0 py-0 translate-x-0"
            {...dropTargetProps}
          >
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

// DrawingItem
type DrawingItemProps = {
  drawing: Drawing
}

export function DrawingItem({ drawing }: DrawingItemProps) {
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const { onDragStart, onDragEnd, onDeleteDrawing } = useSidebarContext()

  const queryClient = useQueryClient()
  const renameMutation = useMutation({
    mutationFn: updateDrawing,
    ...optimisticListMutation<
      Drawing,
      { data: { id: string; updateData: { name?: string } } }
    >({
      queryClient,
      queryKey: queryKeys.drawings(),
      updateFn: (items, variables) =>
        items.map((drawing) =>
          drawing.id === variables.data.id
            ? {
                ...drawing,
                name: variables.data.updateData.name ?? drawing.name,
              }
            : drawing,
        ),
      additionalInvalidations: [queryKeys.drawing(drawing.id)],
    }),
  })

  const handleDrawingRename = useCallback(
    (newName: string) => {
      renameMutation.mutate({
        data: { id: drawing.id, updateData: { name: newName } },
      })
    },
    [drawing.id, renameMutation],
  )

  const {
    isRenaming,
    renameValue,
    setRenameValue,
    refs,
    startRenaming,
    cancelRenaming,
    handleRenameSubmit,
    handleRenameBlur,
    handleDropdownCloseAutoFocus,
  } = useRename({
    currentName: drawing.name,
    onRename: handleDrawingRename,
  })

  const [isDragging, setIsDragging] = useState(false)
  const isActive = drawing.id === currentDrawingId

  const ButtonContent = (
    <>
      <span className="h-3! w-3! shrink-0" />
      <File
        className={cn(
          "h-[13px]! w-[13px]! shrink-0 transition-colors",
          isActive ? "text-notion-terracotta" : "text-muted-foreground/30",
        )}
      />
      {isRenaming ? (
        <Input
          ref={(el) => {
            refs.current.input = el
          }}
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          onBlur={handleRenameBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleRenameSubmit()
            if (e.key === "Escape") cancelRenaming()
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-5 rounded px-1 text-sm"
        />
      ) : (
        <span
          className={cn(
            "truncate transition-colors",
            isActive
              ? "font-medium text-sidebar-foreground"
              : "text-sidebar-foreground/60",
          )}
        >
          {drawing.name}
        </span>
      )}
    </>
  )

  return (
    <SidebarMenuItem
      className={cn("group/drawing-item", isDragging && "opacity-50")}
      draggable
      onDragStart={(e) => {
        onDragStart({ type: "drawing", id: drawing.id })(e)
        setIsDragging(true)
      }}
      onDragEnd={() => {
        onDragEnd()
        setIsDragging(false)
      }}
    >
      <SidebarMenuButton
        asChild={!isRenaming}
        isActive={isActive}
        className={cn(
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! active:cursor-grabbing [&>svg]:size-auto",
          isRenaming && "pr-3!",
        )}
      >
        {isRenaming ? (
          ButtonContent
        ) : (
          <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
            {ButtonContent}
          </Link>
        )}
      </SidebarMenuButton>
      <ItemDropdownMenu
        groupClass="group-hover/drawing-item:opacity-100 group-focus-within/drawing-item:opacity-100"
        isRenaming={isRenaming}
        onStartRename={startRenaming}
        onDelete={() => onDeleteDrawing(drawing.id)}
        onCloseAutoFocus={handleDropdownCloseAutoFocus}
      />
    </SidebarMenuItem>
  )
}

// CreateRow

type CreateRowProps = {
  type: "drawing" | "folder"
  onClose: () => void
}

export function CreateRow({ type, onClose }: CreateRowProps) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [name, setName] = useState(
    type === "drawing" ? "Untitled" : "New folder",
  )
  const inputRef = useRef<HTMLInputElement | null>(null)
  const submitted = useRef(false)

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.drawings() })
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.folders() })
    },
  })

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus()
      inputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [])

  const handleSubmit = async () => {
    if (submitted.current) return
    submitted.current = true

    const trimmed = name.trim()
    if (!trimmed) {
      onClose()
      return
    }

    if (type === "drawing") {
      const newId = await createDrawingMutation.mutateAsync({
        data: { name: trimmed },
      })
      onClose()
      navigate({ to: "/draw/$id", params: { id: newId } })
    } else {
      await createFolderMutation.mutateAsync({
        data: { name: trimmed, parentId: null },
      })
      onClose()
    }
  }

  return (
    <SidebarMenuItem>
      <div className="flex items-center gap-2 px-2 py-1">
        {type === "folder" ? (
          <Folder className="h-[14px] w-[14px] shrink-0 text-notion-gold" />
        ) : (
          <File className="h-[13px] w-[13px] shrink-0 text-muted-foreground/30" />
        )}
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              handleSubmit()
            }
            if (e.key === "Escape") {
              e.preventDefault()
              onClose()
            }
          }}
          className="h-6 flex-1 rounded px-2 text-sm"
        />
      </div>
    </SidebarMenuItem>
  )
}

// TreeNodeItem

export function TreeNodeItem({ node }: { node: TreeNode }) {
  if (node.type === "folder") {
    return <FolderItem folder={node.folder} children={node.children} />
  }
  return <DrawingItem drawing={node.drawing} />
}
