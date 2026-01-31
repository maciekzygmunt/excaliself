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
import { createDrawing, updateDrawing } from "@/server/drawings"
import { createFolder, updateFolder } from "@/server/folders"
import { hasActiveDrawing } from "../-utils/hasActiveDrawing"
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
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["folders"] })
      const previous = queryClient.getQueryData<FolderType[]>(["folders"])
      queryClient.setQueryData<FolderType[]>(["folders"], (old = []) =>
        old.map((f) =>
          f.id === variables.data.id
            ? { ...f, name: variables.data.name ?? f.name }
            : f,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["folders"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] })
    },
  })

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)
  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(folder.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)

  const hasChildren = childNodes.length > 0
  const showDropHighlight =
    dropTarget?.type === "folder" &&
    dropTarget.id === folder.id &&
    dropTarget.position === "inside"

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== folder.name) {
      renameMutation.mutate({
        data: { id: folder.id, name: renameValue.trim() },
      })
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
          showDropHighlight && "bg-sidebar-accent ring-1 ring-sidebar-ring",
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
                  onClick={() => onDeleteFolder(folder.id, hasChildren)}
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
          <SidebarMenuSub className="mr-0 pr-0" {...dropTargetProps}>
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
  const { onDragStart, onDragEnd, onDeleteDrawing } = useSidebarContext()

  const queryClient = useQueryClient()
  const renameMutation = useMutation({
    mutationFn: updateDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["drawings"] })
      const previous = queryClient.getQueryData<Drawing[]>(["drawings"])
      queryClient.setQueryData<Drawing[]>(["drawings"], (old = []) =>
        old.map((d) =>
          d.id === variables.data.id
            ? { ...d, name: variables.data.updateData.name ?? d.name }
            : d,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["drawings"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
      queryClient.invalidateQueries({ queryKey: ["drawing", drawing.id] })
    },
  })

  const [isDragging, setIsDragging] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState(drawing.name)
  const renameInputRef = useRef<HTMLInputElement | null>(null)
  const pendingRenameFocus = useRef(false)

  const isActive = drawing.id === currentDrawingId

  const handleRenameSubmit = () => {
    if (renameValue.trim() && renameValue !== drawing.name) {
      renameMutation.mutate({
        data: { id: drawing.id, updateData: { name: renameValue.trim() } },
      })
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
      <span className="h-4 w-4 shrink-0" />
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
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const createFolderMutation = useMutation({
    mutationFn: createFolder,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] })
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
          <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <File className="h-4 w-4 shrink-0 text-muted-foreground" />
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
