import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { File, Folder, PanelLeft, Plus, Search, Trash2 } from "lucide-react"
import { useEffect, useMemo } from "react"
import { Mark } from "@/components/identity"
import { KEYCAP_CLASS } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Kbd } from "@/components/ui/kbd"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  useSidebar,
} from "@/components/ui/sidebar"
import { type Drawing, drawingsQueryOptions } from "@/features/drawings/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { useIsApplePlatform } from "@/hooks/use-is-apple-platform"
import { cn } from "@/lib/utils"
import { useCommandPalette } from "../CommandPalette"
import { useCreateDialog } from "../CreateDialog"
import { SidebarNav, SidebarNavItem } from "./SidebarNav"
import { type SidebarUser, SidebarUserMenu } from "./SidebarUserMenu"
import { StarredSection } from "./StarredSection"
import { TreeNodeItem } from "./TreeNodeItem"
import { buildTree, treeNodeKey } from "./tree"
import { SidebarDnDProvider, useSidebarDnD } from "./use-sidebar-dnd"

export function DrawSidebar({ user }: { user: SidebarUser }) {
  const { data: drawings = [] } = useQuery(drawingsQueryOptions())
  const { data: folders = [] } = useQuery(foldersQueryOptions())
  const { openCreateDrawingDialog, openCreateFolderDialog } = useCreateDialog()
  const { openCommandPalette } = useCommandPalette()
  const isApplePlatform = useIsApplePlatform()

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

  const displayTree = useMemo(
    () => buildTree(folders, drawings),
    [drawings, folders],
  )

  return (
    <SidebarDnDProvider drawings={drawings} foldersById={foldersById}>
      {/* p-0 drops the inset variant's outer padding so the sidebar content
          spans the full 240px, flush with the chrome — per the prototype. */}
      <Sidebar collapsible="offcanvas" variant="inset" className="p-0">
        <SidebarHeader className="gap-0 px-2 pt-2 pb-0.5">
          {/* The link's and toggle's click-target padding is pulled out of
              the layout flow (-my) so the header keeps the mockup's height. */}
          <div className="flex items-center px-2 py-1.5">
            <Link
              to="/draw"
              className="-mx-1 -my-0.5 flex items-center gap-2.5 rounded-md px-1 py-0.5 focus-visible:bg-sidebar-accent focus-visible:outline-none"
            >
              <Mark className="h-5 w-auto shrink-0 text-iris" />
              <span className="text-sm font-semibold tracking-[-0.01em] text-foreground">
                Excaliself
              </span>
            </Link>
            <SidebarToggle />
          </div>
        </SidebarHeader>

        <div className="px-2 pt-1 pb-1.5">
          <button
            type="button"
            onClick={() => openCreateDrawingDialog()}
            className={cn(
              KEYCAP_CLASS,
              "flex w-full items-center justify-center gap-1.5 py-2 text-[13px] font-medium",
            )}
          >
            <Plus className="h-3 w-3 text-iris" strokeWidth={2.5} />
            New drawing
            <Kbd>N</Kbd>
          </button>
        </div>

        {/* Styled like a search field but it's a palette trigger — no inline
            tree filter remains (spec §2.3). */}
        <div className="px-2 pb-1">
          <button
            type="button"
            onClick={openCommandPalette}
            className="flex w-full items-center gap-2 rounded-md bg-well px-2.5 py-2 text-[13px] text-muted-foreground/70 shadow-well transition-colors hover:bg-well-hover hover:text-muted-foreground focus-visible:bg-well-hover focus-visible:outline-none"
          >
            <Search
              className="h-3.25 w-3.25 shrink-0 text-muted-foreground/50"
              strokeWidth={2.5}
            />
            <span className="flex-1 truncate text-left">Search</span>
            <Kbd>{isApplePlatform ? "⌘K" : "Ctrl K"}</Kbd>
          </button>
        </div>

        <SidebarNav />

        <TreeBody
          displayTree={displayTree}
          drawings={drawings}
          onCreateDrawing={() => openCreateDrawingDialog()}
          onCreateFolder={openCreateFolderDialog}
        />

        <SidebarFooter className="gap-0 p-2">
          {/* Pinned below the scroll region — Trash stays reachable no
              matter how tall the tree grows (spec §2.3). */}
          <SidebarMenu className="gap-0">
            <SidebarNavItem to="/trash" label="Trash" icon={Trash2} />
          </SidebarMenu>
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
      className="-m-1.5 ml-auto rounded-md p-1.5 text-muted-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:outline-none"
    >
      <PanelLeft className="h-3.5 w-3.5" />
    </button>
  )
}

// Starred and the tree share the sidebar's single scroll region — a fixed
// starred list would otherwise squeeze the tree out of view as stars grow.
function TreeBody({
  displayTree,
  drawings,
  onCreateDrawing,
  onCreateFolder,
}: {
  displayTree: ReturnType<typeof buildTree>
  drawings: Drawing[]
  onCreateDrawing: () => void
  onCreateFolder: () => void
}) {
  const { dropTarget, onDragOver, onDragLeave, onDrop } = useSidebarDnD()

  return (
    <SidebarContent className="gap-0 pt-0.5 [scrollbar-width:none]">
      <StarredSection drawings={drawings} />

      <div className="flex items-center justify-between pt-2 pb-0.5 pr-3 pl-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
          Drawings
        </span>
        <div className="flex items-center gap-1">
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
            {drawings.length}
          </span>
          <CreateMenu
            onCreateDrawing={onCreateDrawing}
            onCreateFolder={onCreateFolder}
          />
        </div>
      </div>

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
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="-m-1 rounded-md p-1 text-muted-foreground/40 transition-colors hover:bg-sidebar-accent hover:text-muted-foreground focus-visible:bg-sidebar-accent focus-visible:text-muted-foreground focus-visible:outline-none"
          />
        }
      >
        <Plus className="h-3.5 w-3.5" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" finalFocus={false}>
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
