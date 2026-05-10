import { useQueryClient } from "@tanstack/react-query"
import { Link, useParams } from "@tanstack/react-router"
import { File, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState } from "react"
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
} from "@/components/ui/sidebar"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { useOptimisticListMutation } from "@/hooks/use-optimistic-list-mutation"
import { cn } from "@/lib/utils"
import { updateDrawing } from "@/server/drawings"
import { useSidebarContext } from "./SidebarProvider"
import type { Drawing } from "./tree"

type DrawingItemProps = {
  drawing: Drawing
}

export function DrawingItem({ drawing }: DrawingItemProps) {
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const { onDragStart, onDragEnd, onDeleteDrawing } = useSidebarContext()
  const queryClient = useQueryClient()

  const renameMutation = useOptimisticListMutation<
    Drawing,
    Parameters<typeof updateDrawing>[0]
  >({
    queryKey: ["drawings"],
    mutationFn: updateDrawing,
    optimisticUpdate: (drawings, { data }) =>
      drawings.map((d) =>
        d.id === data.id ? { ...d, name: data.updateData.name ?? d.name } : d,
      ),
  })

  const rename = useInlineRename({
    onSubmit: (newName) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === drawing.name) return
      renameMutation.mutate(
        { data: { id: drawing.id, updateData: { name: trimmed } } },
        {
          onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ["drawing", drawing.id] })
          },
        },
      )
    },
  })

  const [isDragging, setIsDragging] = useState(false)
  const isActive = drawing.id === currentDrawingId

  const buttonContent = (
    <>
      <span className="h-3! w-3! shrink-0" />
      <File
        className={cn(
          "h-[13px]! w-[13px]! shrink-0 transition-colors",
          isActive ? "text-notion-terracotta" : "text-muted-foreground/30",
        )}
      />
      {rename.isRenaming ? (
        <Input {...rename.inputProps} className="h-5 rounded px-1 text-sm" />
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
        asChild={!rename.isRenaming}
        isActive={isActive}
        className={cn(
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! active:cursor-grabbing [&>svg]:size-auto",
          rename.isRenaming && "pr-3!",
        )}
      >
        {rename.isRenaming ? (
          buttonContent
        ) : (
          <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
            {buttonContent}
          </Link>
        )}
      </SidebarMenuButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className={cn(
              "text-muted-foreground/30 md:opacity-0 group-hover/drawing-item:opacity-100 group-focus-within/drawing-item:opacity-100 data-[state=open]:opacity-100 [&>svg]:size-auto",
              // Use `invisible` (not `hidden`) so the trigger stays in
              // layout while renaming — otherwise Radix's closing popper
              // loses its anchor and flashes at viewport (0, 0).
              rename.isRenaming && "invisible pointer-events-none",
            )}
          >
            <MoreHorizontal className="h-[14px]! w-[14px]!" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          onCloseAutoFocus={rename.onMenuCloseAutoFocus}
        >
          <DropdownMenuItem onClick={() => rename.start(drawing.name)}>
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
