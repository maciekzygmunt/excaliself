import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useParams } from "@tanstack/react-router"
import {
  ChevronRight,
  Folder,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react"
import { type DragEvent, useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
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
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { useRenameFolder } from "@/features/folders/mutations"
import { foldersQueryOptions } from "@/features/folders/queries"
import { deleteFolder } from "@/features/folders/server"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { cn } from "@/lib/utils"
import { TreeNodeItem } from "./TreeNodeItem"
import {
  type Folder as FolderModel,
  hasActiveDrawing,
  type TreeNode,
  treeNodeKey,
} from "./tree"
import { type DropTarget, useSidebarDnD } from "./use-sidebar-dnd"

type FolderItemProps = {
  folder: FolderModel
  childNodes: TreeNode[]
}

const TOAST_ID = "delete-folder"

export function FolderItem({ folder, childNodes }: FolderItemProps) {
  const queryClient = useQueryClient()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const {
    dragItem,
    dropTarget,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,
  } = useSidebarDnD()

  const isDragging = dragItem?.id === folder.id

  const renameMutation = useRenameFolder()
  const rename = useInlineRename({
    onSubmit: (newName) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === folder.name) return
      renameMutation.mutate({ data: { id: folder.id, name: trimmed } })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteFolder,
    onMutate: () => toast.loading("Deleting folder...", { id: TOAST_ID }),
    onError: () => toast.error("Failed to delete folder", { id: TOAST_ID }),
    onSuccess: () => toast.success("Folder deleted", { id: TOAST_ID }),
    onSettled: () => {
      queryClient.invalidateQueries(foldersQueryOptions())
      queryClient.invalidateQueries(drawingsQueryOptions())
    },
  })

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)

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
              onDragStart={onDragStart({ type: "folder", id: folder.id })}
              onDragEnd={onDragEnd}
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
              <Folder className="h-3.5! w-3.5! shrink-0 text-notion-gold" />
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

            <AlertDialog>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuAction
                    className={cn(
                      "text-muted-foreground/30 md:opacity-0 group-hover/folder-row:opacity-100 group-focus-within/folder-row:opacity-100 data-[state=open]:opacity-100 [&>svg]:size-auto",
                      // Use `invisible` (not `hidden`) so the trigger stays
                      // in layout while renaming — otherwise Radix's closing
                      // popper loses its anchor and flashes at (0, 0).
                      rename.isRenaming && "invisible pointer-events-none",
                    )}
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-3.5! w-3.5!" />
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
                  <AlertDialogTrigger asChild>
                    <DropdownMenuItem
                      onSelect={(e) => e.preventDefault()}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete
                    </DropdownMenuItem>
                  </AlertDialogTrigger>
                </DropdownMenuContent>
              </DropdownMenu>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete folder?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {hasChildren
                      ? "This folder contains items. All files in this folder will be deleted."
                      : `Delete "${folder.name}"?`}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    className="bg-destructive text-white hover:bg-destructive/90"
                    onClick={() => deleteMutation.mutate({ data: folder.id })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub
            className="ml-3 mr-0 gap-0 border-sidebar-border/50 pl-2 pr-0 py-0 translate-x-0"
            {...dropTargetProps}
          >
            {childNodes.map((node) => (
              <TreeNodeItem key={treeNodeKey(node)} node={node} />
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}
