import { useParams } from "@tanstack/react-router"
import { ChevronRight, Folder } from "lucide-react"
import { type DragEvent, useState } from "react"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import {
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
} from "@/components/ui/sidebar"
import { useDeleteFolder, useRenameFolder } from "@/features/folders/mutations"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { cn } from "@/lib/utils"
import { useCreateDialog } from "../CreateDialog"
import { TreeNodeItem } from "./TreeNodeItem"
import { TreeRowActions } from "./TreeRowActions"
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

export function FolderItem({ folder, childNodes }: FolderItemProps) {
  // Non-strict: on Home no drawing is open and there is no $id param
  const { id: currentDrawingId } = useParams({ strict: false })
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

  const deleteMutation = useDeleteFolder()
  const { openCreateDrawingDialog } = useCreateDialog()

  const containsActive = hasActiveDrawing(childNodes, currentDrawingId)
  const [isExpanded, setIsExpanded] = useState(containsActive)

  const hasChildren = childNodes.length > 0
  const showDropHighlight =
    dropTarget?.type === "folder" && dropTarget.id === folder.id

  const handleDrop = (target: DropTarget) => (e: DragEvent) => {
    onDrop(target)(e)
    setIsExpanded(true)
  }

  const dropTargetProps = {
    onDragOver: onDragOver({ type: "folder", id: folder.id }),
    onDragLeave,
    onDrop: handleDrop({ type: "folder", id: folder.id }),
  }

  return (
    <Collapsible
      open={isExpanded}
      // An empty folder has nothing to reveal: ignore the trigger so clicking
      // it doesn't pulse an empty CollapsibleContent open and shut. Dropping
      // into the folder still expands it (handleDrop) once it gains children.
      onOpenChange={(open) => {
        if (hasChildren) setIsExpanded(open)
      }}
      asChild
    >
      <SidebarMenuItem
        className={cn(
          "rounded-md transition-colors",
          showDropHighlight && "bg-iris-muted ring-1 ring-iris-ring",
        )}
      >
        <CollapsibleTrigger asChild>
          <div
            className={cn(
              "group/tree-row relative flex w-full rounded-md transition-colors",
              isDragging && "opacity-50",
            )}
            {...dropTargetProps}
          >
            <SidebarMenuButton
              draggable
              onDragStart={onDragStart({ type: "folder", id: folder.id })}
              onDragEnd={onDragEnd}
              className={cn(
                "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! text-[13px] active:cursor-grabbing [&>svg]:size-auto",
                rename.isRenaming && "pr-3!",
              )}
            >
              <ChevronRight
                className={cn(
                  "h-3! w-3! shrink-0 text-muted-foreground/40 transition-transform duration-150 ease-out",
                  isExpanded && "rotate-90",
                  !hasChildren && "opacity-0",
                )}
              />
              <Folder className="h-3.5! w-3.5! shrink-0 fill-iris/70 text-iris" />
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

            <TreeRowActions
              isRenaming={rename.isRenaming}
              onStartRename={() => rename.start(folder.name)}
              onCreateDrawing={() =>
                openCreateDrawingDialog({ id: folder.id, name: folder.name })
              }
              onMenuCloseAutoFocus={rename.onMenuCloseAutoFocus}
              onDelete={() => deleteMutation.mutate({ data: folder.id })}
              deleteTitle="Delete folder?"
              deleteDescription={
                hasChildren
                  ? "This folder contains items. All files in this folder will be deleted."
                  : `Delete "${folder.name}"?`
              }
            />
          </div>
        </CollapsibleTrigger>
        {hasChildren && (
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
        )}
      </SidebarMenuItem>
    </Collapsible>
  )
}
