import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import type { ReactNode } from "react"
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
import { SidebarMenuAction } from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

type TreeRowActionsProps = {
  isRenaming: boolean
  onStartRename: () => void
  onMenuCloseAutoFocus: (e: Event) => void
  onDelete: () => void | Promise<void>
  deleteTitle: string
  deleteDescription: ReactNode
}

// Callers must wrap the row in `group/tree-row` on whichever element should
// scope the hover/focus reveal (the SidebarMenuItem for a drawing, the inner
// row div for a folder so children in CollapsibleContent don't count).
export function TreeRowActions({
  isRenaming,
  onStartRename,
  onMenuCloseAutoFocus,
  onDelete,
  deleteTitle,
  deleteDescription,
}: TreeRowActionsProps) {
  return (
    <AlertDialog>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuAction
            className={cn(
              "text-muted-foreground/30 md:opacity-0 group-hover/tree-row:opacity-100 group-focus-within/tree-row:opacity-100 data-[state=open]:opacity-100 [&>svg]:size-auto",
              // Use `invisible` (not `hidden`) so the trigger stays in
              // layout while renaming — otherwise Radix's closing popper
              // loses its anchor and flashes at viewport (0, 0)
              isRenaming && "invisible pointer-events-none",
            )}
            // Stop pointer/click from bubbling to ancestor triggers such as
            // FolderItem's CollapsibleTrigger
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5! w-3.5!" />
          </SidebarMenuAction>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="right"
          align="start"
          onCloseAutoFocus={onMenuCloseAutoFocus}
        >
          <DropdownMenuItem onClick={onStartRename}>
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
          <AlertDialogTitle>{deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>{deleteDescription}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-white hover:bg-destructive/90"
            onClick={onDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
