import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Link, useNavigate, useParams } from "@tanstack/react-router"
import { File, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
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
import { useRenameDrawing } from "@/features/drawings/mutations"
import {
  drawingQueryOptions,
  drawingsQueryOptions,
} from "@/features/drawings/queries"
import { createDrawing, deleteDrawing } from "@/features/drawings/server"
import { useInlineRename } from "@/hooks/use-inline-rename"
import {
  removeById,
  useOptimisticListMutation,
} from "@/hooks/use-optimistic-list-mutation"
import { cn } from "@/lib/utils"
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
      renameMutation.mutate(
        { data: { id: drawing.id, updateData: { name: trimmed } } },
        {
          onSettled: () => {
            queryClient.invalidateQueries(drawingQueryOptions(drawing.id))
          },
        },
      )
    },
  })

  const deleteMutation = useOptimisticListMutation<
    Drawing,
    Parameters<typeof deleteDrawing>[0]
  >({
    queryKey: drawingsQueryOptions().queryKey,
    mutationFn: deleteDrawing,
    optimisticUpdate: (list, { data: id }) => removeById(list, id),
  })

  const createMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => queryClient.invalidateQueries(drawingsQueryOptions()),
  })

  const handleDelete = async () => {
    await deleteMutation.mutateAsync({ data: drawing.id })
    if (drawing.id !== currentDrawingId) return

    const remaining = queryClient.getQueryData(drawingsQueryOptions().queryKey)
    const next = remaining?.find((d) => d.id !== drawing.id)
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
      className={cn("group/drawing-item", isDragging && "opacity-50")}
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

      <AlertDialog>
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
              <MoreHorizontal className="h-3.5! w-3.5!" />
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
            <AlertDialogTitle>Delete drawing?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{drawing.name}"?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleDelete}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenuItem>
  )
}
