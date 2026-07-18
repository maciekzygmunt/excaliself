import { useQuery } from "@tanstack/react-query"
import { File, Folder, PanelLeft, Pencil, Plus } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
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
  useSidebar,
} from "@/components/ui/sidebar"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { cn } from "@/lib/utils"
import { useCreateDrawingDialog } from "../CreateDrawingDialog"
import { CreateFolderRow } from "./CreateFolderRow"
import { Kbd } from "./Kbd"
import { SidebarSearch } from "./SidebarSearch"
import { type SidebarUser, SidebarUserMenu } from "./SidebarUserMenu"
import { TreeNodeItem } from "./TreeNodeItem"
import { buildTree, filterTreeBySearch, treeNodeKey } from "./tree"
import { SidebarDnDProvider, useSidebarDnD } from "./use-sidebar-dnd"

export function DrawSidebar({ user }: { user: SidebarUser }) {
  const { data: drawings = [] } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const { openCreateDrawingDialog } = useCreateDrawingDialog()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      )
        return
      e.preventDefault()
      openCreateDrawingDialog()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [openCreateDrawingDialog])

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
      <Sidebar collapsible="offcanvas" variant="inset">
        <SidebarHeader className="gap-0 px-2 pt-2 pb-1">
          <div className="flex items-center gap-2.5 px-2 py-1.5">
            <div className="flex size-6 shrink-0 items-center justify-center rounded-md bg-gradient-to-b from-[#8d85d6] to-[#6f66c9] shadow-[inset_0_1px_0_rgba(255,255,255,0.3),0_1px_2px_rgba(0,0,0,0.35)]">
              <Pencil className="h-3 w-3 text-white" strokeWidth={2} />
            </div>
            <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">
              Excaliself
            </span>
            <SidebarToggle />
          </div>
        </SidebarHeader>

        <div className="px-2 pt-1 pb-1.5">
          <button
            type="button"
            onClick={() => openCreateDrawingDialog()}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-card py-2 text-[13px] font-medium text-foreground shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_2px_5px_rgba(20,20,45,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] active:scale-[0.98] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          >
            <Plus className="h-2.75 w-2.75 text-iris" strokeWidth={2.5} />
            New drawing
            <Kbd>N</Kbd>
          </button>
        </div>

        <SidebarSearch value={searchQuery} onChange={setSearchQuery} />

        <div className="flex items-center justify-between pt-2 pb-0.5 pr-3 pl-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
            Drawings
          </span>
          <div className="flex items-center gap-1">
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
              {drawings.length}
            </span>
            <CreateMenu
              onCreateDrawing={() => openCreateDrawingDialog()}
              onCreateFolder={() => setIsCreatingFolder(true)}
            />
          </div>
        </div>

        <TreeBody
          displayTree={displayTree}
          isCreatingFolder={isCreatingFolder}
          onCloseFolderCreate={() => setIsCreatingFolder(false)}
        />

        <SidebarFooter className="gap-0 p-2">
          <SidebarUserMenu user={user} />
        </SidebarFooter>
      </Sidebar>
    </SidebarDnDProvider>
  )
}

function SidebarToggle() {
  const { toggleSidebar } = useSidebar()
  return (
    <button
      type="button"
      onClick={toggleSidebar}
      aria-label="Toggle Sidebar"
      className="ml-auto rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:outline-none"
    >
      <PanelLeft className="h-3.5 w-3.5" />
    </button>
  )
}

function TreeBody({
  displayTree,
  isCreatingFolder,
  onCloseFolderCreate,
}: {
  displayTree: ReturnType<typeof buildTree>
  isCreatingFolder: boolean
  onCloseFolderCreate: () => void
}) {
  const { dropTarget, onDragOver, onDragLeave, onDrop } = useSidebarDnD()

  return (
    <SidebarContent className="gap-0 pt-0.5 [scrollbar-width:none]">
      <div className="px-2">
        <div
          className={cn(
            "min-h-50 rounded-md pb-4 transition-colors",
            dropTarget?.type === "root" &&
              "bg-iris-muted ring-2 ring-iris-ring",
          )}
          onDragOver={onDragOver({ type: "root" })}
          onDragLeave={onDragLeave}
          onDrop={onDrop({ type: "root" })}
        >
          <SidebarMenu className="gap-0">
            {isCreatingFolder && (
              <CreateFolderRow onClose={onCloseFolderCreate} />
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

function CreateMenu({
  onCreateDrawing,
  onCreateFolder,
}: {
  onCreateDrawing: () => void
  onCreateFolder: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-muted-foreground focus-visible:outline-none"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-48"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <DropdownMenuItem onClick={onCreateDrawing}>
          <File className="mr-2 h-4 w-4" />
          New drawing
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onCreateFolder}>
          <Folder className="mr-2 h-4 w-4" />
          New folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
