import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { File } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import {
  useDeleteDrawing,
  useRenameDrawing,
} from "@/features/drawings/mutations"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { createDrawing } from "@/features/drawings/server"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { cn } from "@/lib/utils"
import { TreeRowActions } from "./TreeRowActions"
import type { Drawing } from "./tree"
import { useSidebarDnD } from "./use-sidebar-dnd"

type DrawingItemProps = {
  drawing: Drawing
}

export function DrawingItem({ drawing }: DrawingItemProps) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })
  const { dragItem, onDragStart, onDragEnd } = useSidebarDnD()

  const isDragging = dragItem?.id === drawing.id
  const isActive = drawing.id === currentDrawingId

  const renameMutation = useRenameDrawing()
  const rename = useInlineRename({
    onSubmit: (newName) => {
      const trimmed = newName.trim()
      if (!trimmed || trimmed === drawing.name) return
      renameMutation.mutate({
        data: { id: drawing.id, updateData: { name: trimmed } },
      })
    },
  })

  const deleteMutation = useDeleteDrawing()

  const createMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ data: drawing.id })
    if (drawing.id !== currentDrawingId) return

    const remaining = queryClient.getQueryData(drawingsQueryOptions().queryKey)
    const next = remaining?.[0]
    if (next) {
      navigate({ to: "/draw/$id", params: { id: next.id } })
      return
    }
    const newId = await createMutation.mutateAsync({ data: {} })
    navigate({ to: "/draw/$id", params: { id: newId } })
  }

  const content = (
    <>
      <span className="h-3! w-3! shrink-0" />
      <File
        className={cn(
          "h-3.25! w-3.25! shrink-0 transition-colors",
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
      className={cn("group/tree-row", isDragging && "opacity-50")}
      draggable
      onDragStart={onDragStart({ type: "drawing", id: drawing.id })}
      onDragEnd={onDragEnd}
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
          content
        ) : (
          <Link to="/draw/$id" params={{ id: drawing.id }} draggable={false}>
            {content}
          </Link>
        )}
      </SidebarMenuButton>

      <TreeRowActions
        isRenaming={rename.isRenaming}
        onStartRename={() => rename.start(drawing.name)}
        onMenuCloseAutoFocus={rename.onMenuCloseAutoFocus}
        onDelete={handleDelete}
        deleteTitle="Delete drawing?"
        deleteDescription={`Are you sure you want to delete "${drawing.name}"?`}
      />
    </SidebarMenuItem>
  )
}
