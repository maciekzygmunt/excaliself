import { useParams } from "@tanstack/react-router"
import {
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { type DragEvent, useState } from "react"
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
import { useInlineRename } from "@/hooks/use-inline-rename"
import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { cn } from "@/lib/utils"
import { updateFolder } from "@/server/folders"
import { hasActiveDrawing } from "../../-utils/hasActiveDrawing"
import { useSidebarContext } from "./SidebarProvider"
import { TreeNodeItem } from "./TreeNodeItem"
import type { DropTarget, FolderType, TreeNode } from "./tree"

type FolderItemProps = {
  folder: FolderType
  childNodes: TreeNode[]
}

export function FolderItem({ folder, childNodes }: FolderItemProps) {
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

  const renameMutation = useOptimisticListMutation<
    FolderType,
    Parameters<typeof updateFolder>[0]
  >({
    queryKey: ["folders"],
    mutationFn: updateFolder,
    optimisticUpdate: (folders, { data }) =>
      folders.map((f) =>
        f.id === data.id ? { ...f, name: data.name ?? f.name } : f,
      ),
  })

  const rename = useInlineRename({
    onSubmit: (newName) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === folder.name) return
      renameMutation.mutate({ data: { id: folder.id, name: trimmed } })
    },
  })

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)
  const [isDragging, setIsDragging] = useState(false)

  const hasChildren = childNodes.length > 0
  const showDropHighlight =
    dropTarget?.type === "folder" &&
    dropTarget.id === folder.id &&
    dropTarget.position === "inside"

  const handleDrop = (target: DropTarget) => (e: DragEvent) => {
    onDrop(target)(e)
    setIsExpanded(true)
  }

  const dropTargetProps = {
    onDragOver: onDragOver({
      type: "folder",
      id: folder.id,
      position: "inside",
    }),
    onDragLeave,
    onDrop: handleDrop({ type: "folder", id: folder.id, position: "inside" }),
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
              onDragStart={(e) => {
                onDragStart({ type: "folder", id: folder.id })(e)
                setIsDragging(true)
              }}
              onDragEnd={() => {
                onDragEnd()
                setIsDragging(false)
              }}
              className={cn(
                "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! active:cursor-grabbing [&>svg]:size-auto",
                rename.isRenaming && "pr-3!",
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
              {rename.isRenaming ? (
                <Input
                  {...rename.inputProps}
                  className="h-5 rounded px-1 text-sm"
                />
              ) : (
                <span className="truncate text-sidebar-foreground/70">
                  {folder.name}
                </span>
              )}
            </SidebarMenuButton>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuAction
                  className={cn(
                    "text-muted-foreground/30 md:opacity-0 group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100 data-[state=open]:opacity-100 [&>svg]:size-auto",
                    rename.isRenaming && "hidden",
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
                onCloseAutoFocus={rename.onMenuCloseAutoFocus}
              >
                <DropdownMenuItem onClick={() => rename.start(folder.name)}>
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
