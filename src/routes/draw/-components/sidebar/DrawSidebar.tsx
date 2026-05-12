import { useQuery } from "@tanstack/react-query"
import { File, Folder, Plus } from "lucide-react"
import { useMemo, useState } from "react"
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
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { cn } from "@/lib/utils"
import { CreateRow } from "./CreateRow"
import { SidebarSearch } from "./SidebarSearch"
import { SidebarUserMenu } from "./SidebarUserMenu"
import { TreeNodeItem } from "./TreeNodeItem"
import { buildTree, filterTreeBySearch, treeNodeKey } from "./tree"
import { SidebarDnDProvider, useSidebarDnD } from "./use-sidebar-dnd"

type DrawSidebarProps = {
  userEmail: string
  isAdmin: boolean
}

type CreateType = "drawing" | "folder"

export function DrawSidebar({ userEmail, isAdmin }: DrawSidebarProps) {
  const { data: drawings = [] } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const [searchQuery, setSearchQuery] = useState("")
  const [createType, setCreateType] = useState<CreateType | null>(null)

  const foldersById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  )

  const displayTree = useMemo(() => {
    return searchQuery.trim()
      ? filterTreeBySearch(drawings, searchQuery)
      : buildTree(folders, drawings)
  }, [drawings, folders, searchQuery])

  return (
    <SidebarDnDProvider drawings={drawings} foldersById={foldersById}>
      <Sidebar collapsible="offcanvas" variant="sidebar">
        <SidebarHeader className="gap-0 px-3 pt-4 pb-2">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-sidebar-accent cursor-pointer">
            <div className="flex h-5 w-5 items-center justify-center rounded bg-notion-terracotta text-[10px] font-semibold text-white">
              E
            </div>
            <span className="text-sm font-medium tracking-[-0.01em] text-sidebar-foreground">
              Excaliself
            </span>
          </div>
        </SidebarHeader>

        <SidebarSearch value={searchQuery} onChange={setSearchQuery} />

        <div className="mx-4 my-2 h-px bg-sidebar-border" />

        <div className="flex items-center justify-between px-5 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground/50">
            Drawings
          </span>
          <CreateMenu onSelect={setCreateType} />
        </div>

        <TreeBody
          displayTree={displayTree}
          createType={createType}
          onCloseCreate={() => setCreateType(null)}
        />

        <SidebarFooter className="gap-0 border-t border-sidebar-border px-3 pb-3 pt-1">
          <SidebarUserMenu userEmail={userEmail} isAdmin={isAdmin} />
        </SidebarFooter>
      </Sidebar>
    </SidebarDnDProvider>
  )
}

function TreeBody({
  displayTree,
  createType,
  onCloseCreate,
}: {
  displayTree: ReturnType<typeof buildTree>
  createType: CreateType | null
  onCloseCreate: () => void
}) {
  const { dropTarget, onDragOver, onDragLeave, onDrop } = useSidebarDnD()

  return (
    <SidebarContent className="gap-0 pt-1 [scrollbar-width:none]">
      <div className="px-3">
        <div
          className={cn(
            "min-h-50 rounded-md pb-4 transition-colors",
            dropTarget?.type === "root" &&
              "bg-notion-terracotta-muted ring-2 ring-notion-terracotta/20",
          )}
          onDragOver={onDragOver({ type: "root" })}
          onDragLeave={onDragLeave}
          onDrop={onDrop({ type: "root" })}
        >
          <SidebarMenu className="gap-0">
            {createType && (
              <CreateRow type={createType} onClose={onCloseCreate} />
            )}
            {displayTree.map((node) => (
              <TreeNodeItem key={treeNodeKey(node)} node={node} />
            ))}
          </SidebarMenu>
        </div>
      </div>
    </SidebarContent>
  )
}

function CreateMenu({ onSelect }: { onSelect: (type: CreateType) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground/40 transition-all hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-muted-foreground focus-visible:outline-none"
        >
          <Plus className="h-3.5 w-3.5" />
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
