import { Link } from "@tanstack/react-router"
import {
  File,
  Folder,
  LogOut,
  Plus,
  Search,
  Settings,
  X,
} from "lucide-react"
import { useRef, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { CreateRow, TreeNodeItem } from "./FileTreeItem"
import type { ConfirmDialog } from "./SidebarContext"
import { useSidebarContext } from "./SidebarContext"

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
}

export function DrawSidebar({ userEmail, isAdmin }: DrawSidebarProps) {
  const {
    tree,
    filteredTree,
    searchQuery,
    setSearchQuery,
    dropTarget,
    onDragOver,
    onDragLeave,
    onDrop,
    confirmDialog,
    closeConfirmDialog,
  } = useSidebarContext()

  const searchInputRef = useRef<HTMLInputElement>(null)
  const isSearching = searchQuery.length > 0
  const displayTree = isSearching ? filteredTree : tree

  const [createType, setCreateType] = useState<"drawing" | "folder" | null>(
    null,
  )

  return (
    <>
      <Sidebar collapsible="offcanvas" variant="sidebar">
        {/* Workspace header */}
        <SidebarHeader className="gap-0 px-3 pt-4 pb-2">
          <div
            className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent cursor-pointer"
          >
            <div className="flex h-5 w-5 items-center justify-center rounded bg-notion-terracotta text-[10px] font-semibold text-white">
              E
            </div>
            <span className="text-sm font-medium tracking-[-0.01em] text-sidebar-foreground">
              Excalidraw
            </span>
          </div>
        </SidebarHeader>

        {/* Search */}
        <div className="px-3 pb-1">
          <div className="group/search relative flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors focus-within:bg-sidebar-accent hover:bg-sidebar-accent">
            <Search className="h-[14px] w-[14px] shrink-0 text-muted-foreground/60" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search..."
              className="h-auto w-full bg-transparent text-sm text-sidebar-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            />
            {isSearching && (
              <button
                onClick={() => {
                  setSearchQuery("")
                  searchInputRef.current?.blur()
                }}
                className="shrink-0 rounded p-0.5 text-muted-foreground/40 hover:text-muted-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-4 my-2 h-px bg-sidebar-border" />

        {/* Section label with add button */}
        <div className="flex items-center justify-between px-5 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Drawings
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="rounded p-0.5 text-muted-foreground/40 transition-all hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-muted-foreground focus-visible:outline-none"
              >
                <Plus className="h-[14px] w-[14px]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-48"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <DropdownMenuItem onClick={() => setCreateType("drawing")}>
                <File className="mr-2 h-4 w-4" />
                New Drawing
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCreateType("folder")}>
                <Folder className="mr-2 h-4 w-4" />
                New Folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* File tree */}
        <SidebarContent className="gap-0 pt-1 [scrollbar-width:none]">
          <div className="px-3">
            <div
              className={cn(
                "min-h-[200px] rounded-md pb-4 transition-colors",
                dropTarget?.type === "root" &&
                  "bg-notion-terracotta-muted ring-2 ring-notion-terracotta/20",
              )}
              onDragOver={onDragOver({ type: "root" })}
              onDragLeave={onDragLeave}
              onDrop={onDrop({ type: "root" })}
            >
              <SidebarMenu className="gap-0">
                {createType && (
                  <CreateRow
                    type={createType}
                    onClose={() => setCreateType(null)}
                  />
                )}
                {displayTree.map((node) => (
                  <TreeNodeItem
                    key={
                      node.type === "folder"
                        ? node.folder.id
                        : node.drawing.id
                    }
                    node={node}
                  />
                ))}
              </SidebarMenu>
            </div>
          </div>
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="gap-0 border-t border-sidebar-border px-3 pb-3 pt-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px] font-medium text-sidebar-foreground">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0 text-left">
                  <div className="truncate text-sm text-sidebar-foreground/80">
                    {userEmail}
                  </div>
                </div>
                <Settings className="h-[13px] w-[13px] shrink-0 text-muted-foreground/30" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
              side="top"
              align="start"
              sideOffset={4}
            >
              {isAdmin && (
                <>
                  <DropdownMenuItem asChild>
                    <Link to="/admin">
                      <Settings className="mr-2 h-4 w-4" />
                      Admin Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut()
                  window.location.href = "/login"
                }}
              >
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarFooter>
      </Sidebar>
      <ConfirmDeleteDialog
        dialog={confirmDialog}
        onClose={closeConfirmDialog}
      />
    </>
  )
}

function ConfirmDeleteDialog({
  dialog,
  onClose,
}: {
  dialog: ConfirmDialog
  onClose: () => void
}) {
  const handleConfirm = async () => {
    const action = dialog?.onConfirm
    onClose()
    if (action) {
      await action()
    }
  }

  return (
    <AlertDialog
      open={!!dialog}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      {dialog && (
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialog.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {dialog.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={handleConfirm}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      )}
    </AlertDialog>
  )
}
