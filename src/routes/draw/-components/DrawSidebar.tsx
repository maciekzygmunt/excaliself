import { Link } from '@tanstack/react-router'
import { File, Folder, Hexagon, LogOut, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
} from '@/components/ui/sidebar'
import { authClient } from '@/lib/auth-client'
import { cn } from '@/lib/utils'
import { CreateRow, TreeNodeItem } from './FileTreeItem'
import type { ConfirmDialog } from './SidebarContext'
import { useSidebarContext } from './SidebarContext'

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
  variant?: 'sidebar' | 'floating' | 'inset'
}

export function DrawSidebar({ userEmail, isAdmin, variant = 'inset' }: DrawSidebarProps) {
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

  const isSearching = searchQuery.length > 0
  const displayTree = isSearching ? filteredTree : tree

  const [createType, setCreateType] = useState<'drawing' | 'folder' | null>(
    null,
  )

  return (
    <>
      <Sidebar variant={variant} collapsible="offcanvas" className="border-0">
        {/* Workspace identity — Arc places this at top */}
        <SidebarHeader className="px-3 pt-3 pb-2 gap-0">
          <div className="flex items-center gap-2.5 h-9 px-2 text-sidebar-foreground">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-muted">
              <Hexagon className="w-3.5 h-3.5 text-brand" strokeWidth={2.75} />
            </div>
            <span className="font-semibold text-[14px] tracking-[-0.01em]">
              Excalidraw
            </span>
          </div>
        </SidebarHeader>

        <SidebarContent className="bg-transparent gap-0">
          {/* Command bar — Arc's signature pill */}
          <div className="px-3 pt-1 pb-3">
            <div className="relative group flex items-center h-9 bg-sidebar-accent/60 hover:bg-sidebar-accent rounded-lg px-3 focus-within:bg-background focus-within:ring-1 focus-within:ring-sidebar-border focus-within:shadow-sm transition-all">
              <Search
                className="w-4 h-4 text-sidebar-foreground/50 mr-2.5 shrink-0"
                strokeWidth={2.25}
              />
              <input
                type="text"
                placeholder="Search"
                aria-label="Search drawings"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[13.5px] placeholder:text-sidebar-foreground/45 focus:outline-none text-sidebar-foreground"
              />
            </div>
          </div>

          <SidebarGroup className="px-2 py-0 flex-1">
            <SidebarGroupContent className="flex flex-1 flex-col">
              {/* New item — Arc's + action */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 h-9 px-2.5 rounded-lg text-[13.5px] text-sidebar-foreground/70 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground transition-colors"
                  >
                    <Plus className="w-4 h-4 shrink-0" strokeWidth={2.25} />
                    <span>New tab</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 rounded-xl border-border shadow-md p-1"
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <DropdownMenuItem
                    onClick={() => setCreateType('drawing')}
                    className="text-[13px] rounded-lg py-2 cursor-pointer focus:bg-accent"
                  >
                    <File
                      className="mr-2 h-4 w-4 text-muted-foreground"
                      strokeWidth={2}
                    />
                    New Drawing
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => setCreateType('folder')}
                    className="text-[13px] rounded-lg py-2 cursor-pointer focus:bg-accent"
                  >
                    <Folder
                      className="mr-2 h-4 w-4 text-muted-foreground"
                      strokeWidth={2}
                    />
                    New Folder
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Section label — Arc's quiet separators */}
              <div className="mt-5 mb-1.5 px-2.5 text-[11.5px] font-medium text-sidebar-foreground/40">
                Drawings
              </div>

              <div
                className={cn(
                  'flex-1 rounded-md transition-all duration-200',
                  dropTarget?.type === 'root' &&
                    'bg-sidebar-accent/60 ring-1 ring-sidebar-border',
                )}
                onDragOver={onDragOver({ type: 'root' })}
                onDragLeave={onDragLeave}
                onDrop={onDrop({ type: 'root' })}
              >
                <SidebarMenu className="gap-0.5">
                  {createType && (
                    <CreateRow
                      type={createType}
                      onClose={() => setCreateType(null)}
                    />
                  )}
                  {displayTree.map((node) => (
                    <TreeNodeItem
                      key={
                        node.type === 'folder'
                          ? node.folder.id
                          : node.drawing.id
                      }
                      node={node}
                    />
                  ))}
                </SidebarMenu>
                {isSearching && displayTree.length === 0 && (
                  <p className="px-2 py-6 text-center text-[13px] text-sidebar-foreground/45">
                    No results
                  </p>
                )}
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer — Arc's profile button */}
        <SidebarFooter className="px-2 pb-2 pt-1 bg-transparent">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 h-10 w-full rounded-lg px-2 hover:bg-sidebar-accent/70 cursor-pointer transition-colors text-[13.5px] text-sidebar-foreground"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-[11px] font-semibold text-primary-foreground shrink-0">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left leading-tight flex-1 truncate">
                  <span className="truncate text-[13px] text-sidebar-foreground/90">
                    {userEmail}
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border-border shadow-md p-1"
              side="top"
              align="start"
              sideOffset={6}
            >
              {isAdmin && (
                <>
                  <DropdownMenuItem
                    asChild
                    className="text-[13px] rounded-lg py-2 cursor-pointer focus:bg-accent"
                  >
                    <Link to="/admin">Settings</Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border my-1" />
                </>
              )}
              <DropdownMenuItem
                onClick={async () => {
                  await authClient.signOut()
                  window.location.href = '/login'
                }}
                className="text-[13px] text-destructive rounded-lg py-2 cursor-pointer focus:bg-destructive/10 focus:text-destructive"
              >
                <LogOut className="mr-2 h-4 w-4" strokeWidth={2} />
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
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
