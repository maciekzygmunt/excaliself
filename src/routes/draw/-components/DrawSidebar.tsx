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

  const isSearching = searchQuery.length > 0
  const displayTree = isSearching ? filteredTree : tree

  const [createType, setCreateType] = useState<'drawing' | 'folder' | null>(
    null,
  )

  return (
    <>
      <Sidebar
        collapsible="offcanvas"
        className="border-r border-sidebar-border"
      >
        {/* Header */}
        <SidebarHeader className="h-14 flex flex-row items-center px-4 border-b border-sidebar-border m-0 p-0 rounded-none bg-transparent">
          <div className="flex items-center gap-2.5 text-sidebar-foreground transition-colors w-full px-4 h-full">
            <Hexagon className="w-4 h-4" strokeWidth={2} />
            <span className="font-medium text-[13px]">Excalidraw</span>
          </div>
        </SidebarHeader>

        <SidebarContent className="bg-transparent">
          {/* Search */}
          <div className="px-3 py-3">
            <div className="relative group flex items-center bg-background border border-input rounded-[6px] px-2.5 py-1.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/50 transition-all">
              <Search
                className="w-4 h-4 text-muted-foreground mr-2"
                strokeWidth={2}
              />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[13px] placeholder:text-muted-foreground focus:outline-none text-sidebar-foreground"
              />
              <div className="flex items-center gap-1 bg-muted rounded-[4px] px-1.5 py-0.5 text-[10px] text-muted-foreground font-medium border border-border">
                <span>⌘</span>
                <span>K</span>
              </div>
            </div>
          </div>

          <SidebarGroup className="pt-0 px-2">
            <SidebarGroupContent>
              {/* Global Add Button */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2.5 px-2.5 py-1.5 rounded-[6px] text-[13px] text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
                  >
                    <Plus className="w-4 h-4" strokeWidth={2} />
                    <span className="font-medium">New item...</span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  className="w-56 rounded-xl border-border shadow-sm p-1"
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

              <div className="mt-6 mb-2 px-2.5 text-[11px] font-semibold text-muted-foreground tracking-wider uppercase">
                Drawings
              </div>

              <div
                className={cn(
                  'min-h-[200px] rounded-md transition-colors',
                  dropTarget?.type === 'root' &&
                    'bg-sidebar-accent/50 ring-1 ring-sidebar-border',
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
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="p-3 border-t border-sidebar-border bg-transparent">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex items-center gap-2.5 p-1.5 w-full rounded-[6px] hover:bg-sidebar-accent cursor-pointer transition-colors text-[13px] text-sidebar-foreground/70"
              >
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col text-left leading-tight flex-1 truncate">
                  <span className="font-medium truncate text-sidebar-foreground">
                    {userEmail}
                  </span>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-xl border-border shadow-sm p-1"
              side="bottom"
              align="end"
              sideOffset={4}
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
