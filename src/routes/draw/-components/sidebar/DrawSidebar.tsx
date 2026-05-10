import { File, Folder, Plus } from "lucide-react"
import { useState } from "react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"
import { ConfirmDeleteDialog } from "./ConfirmDeleteDialog"
import { CreateRow } from "./CreateRow"
import { useSidebarContext } from "./SidebarProvider"
import { SidebarSearch } from "./SidebarSearch"
import { SidebarUserMenu } from "./SidebarUserMenu"
import { TreeNodeItem, treeNodeKey } from "./TreeNodeItem"

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
}

export function DrawSidebar({ userEmail, isAdmin }: DrawSidebarProps) {
  const {
    tree,
    filteredTree,
    searchQuery,
    dropTarget,
    onDragOver,
    onDragLeave,
    onDrop,
    confirmDialog,
    closeConfirmDialog,
  } = useSidebarContext()

  const [createType, setCreateType] = useState<"drawing" | "folder" | null>(
    null,
  )

  const isSearching = searchQuery.length > 0
  const displayTree = isSearching ? filteredTree : tree

  return (
    <>
      <Sidebar collapsible="offcanvas" variant="sidebar">
        <SidebarHeader className="gap-0 px-3 pt-4 pb-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent cursor-pointer">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-notion-terracotta text-[10px] font-semibold text-white">
              E
            </div>
            <span className="text-sm font-medium tracking-[-0.01em] text-sidebar-foreground">
              Excalidraw
            </span>
          </div>
        </SidebarHeader>

        <SidebarSearch />

        <div className="mx-4 my-2 h-px bg-sidebar-border" />

        <div className="flex items-center justify-between px-5 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Drawings
          </span>
          <CreateMenu onSelect={setCreateType} />
        </div>

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
                  <TreeNodeItem key={treeNodeKey(node)} node={node} />
                ))}
              </SidebarMenu>
            </div>
          </div>
        </SidebarContent>

        <SidebarFooter className="gap-0 border-t border-sidebar-border px-3 pb-3 pt-1">
          <SidebarUserMenu userEmail={userEmail} isAdmin={isAdmin} />
        </SidebarFooter>
      </Sidebar>
      <ConfirmDeleteDialog
        dialog={confirmDialog}
        onClose={closeConfirmDialog}
      />
    </>
  )
}

function CreateMenu({
  onSelect,
}: {
  onSelect: (type: "drawing" | "folder") => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
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
        <DropdownMenuItem onClick={() => onSelect("drawing")}>
          <File className="mr-2 h-4 w-4" />
          New Drawing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSelect("folder")}>
          <Folder className="mr-2 h-4 w-4" />
          New Folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
