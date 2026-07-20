import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { File } from "lucide-react"
import { Input } from "@/components/ui/input"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"
import {
  useRenameDrawing,
  useToggleStarDrawing,
  useTrashDrawing,
} from "@/features/drawings/mutations"
import { useInlineRename } from "@/hooks/use-inline-rename"
import { cn } from "@/lib/utils"
import { TreeRowActions } from "./TreeRowActions"
import type { Drawing } from "./tree"
import { useSidebarDnD } from "./use-sidebar-dnd"

type DrawingItemProps = {
  drawing: Drawing
}

export function DrawingItem({ drawing }: DrawingItemProps) {
  const navigate = useNavigate()
  // Non-strict: on Home no drawing is open and there is no $id param
  const { id: currentDrawingId } = useParams({ strict: false })
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

  const trashDrawing = useTrashDrawing()
  const starMutation = useToggleStarDrawing()

  const handleTrash = () => {
    // Instant, no confirm — the mutation shows the undo toast itself
    trashDrawing(drawing)
    // Trashing the open drawing lands on Home, never on a dead URL
    if (drawing.id === currentDrawingId) navigate({ to: "/draw" })
  }

  const content = (
    <>
      <span className="h-3! w-3! shrink-0" />
      <File
        className={cn(
          "h-3.25! w-3.25! shrink-0 transition-colors",
          isActive ? "text-iris" : "text-muted-foreground/40",
        )}
      />
      {rename.isRenaming ? (
        <Input {...rename.inputProps} className="h-5 rounded px-1 text-sm" />
      ) : (
        <span
          className={cn(
            "truncate transition-colors",
            isActive
              ? "font-medium text-iris-strong"
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
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! text-[13px] active:cursor-grabbing [&>svg]:size-auto",
          "data-[active=true]:bg-iris-muted data-[active=true]:shadow-[inset_0_0_0_1px_var(--iris-ring)]",
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
        starred={drawing.starred}
        onToggleStar={() =>
          starMutation.mutate({
            data: { id: drawing.id, starred: !drawing.starred },
          })
        }
        onStartRename={() => rename.start(drawing.name)}
        onMenuCloseAutoFocus={rename.onMenuCloseAutoFocus}
        onTrash={handleTrash}
      />
    </SidebarMenuItem>
  )
}
