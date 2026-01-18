import {
  createFileRoute,
  Link,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import {
  ChevronRight,
  File,
  Folder,
  LogOut,
  MoreVertical,
  Plus,
  Settings,
  Trash2,
  User,
} from "lucide-react"
import type { DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarOverlay,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { signOut } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { authMiddleware } from "@/middleware/auth"
import {
  createDrawing,
  deleteDrawing,
  getDrawings,
  updateDrawing,
} from "@/server/drawings"
import { createFolder, getFolders, updateFolder } from "@/server/folders"
import { isSetupComplete } from "@/server/users"

type Drawing = Awaited<ReturnType<typeof getDrawings>>[number]
type FolderType = Awaited<ReturnType<typeof getFolders>>[number]

type DragItem = {
  type: "drawing" | "folder"
  id: string
}

type DropTarget = { type: "root" } | { type: "folder"; id: string } | null

type CreateRowProps = {
  depth: number
  parentId: string | null
  createDraft: { type: "drawing" | "folder"; parentId: string | null } | null
  createName: string
  setCreateName: (name: string) => void
  finalizeCreate: () => void
  cancelCreate: () => void
  createInputRef: React.RefObject<HTMLInputElement | null>
  open: boolean
}

function CreateRow({
  depth,
  parentId,
  createDraft,
  createName,
  setCreateName,
  finalizeCreate,
  cancelCreate,
  createInputRef,
  open,
}: CreateRowProps) {
  if (!createDraft || createDraft.parentId !== parentId || !open) return null
  const isDrawing = createDraft.type === "drawing"

  return (
    <div
      className="flex items-center gap-2 py-1"
      style={open ? { paddingLeft: depth * 12 + 8 } : undefined}
    >
      <div className="flex h-5 w-5 shrink-0 items-center justify-center text-muted-foreground">
        {isDrawing ? (
          <File className="h-4 w-4" />
        ) : (
          <Folder className="h-4 w-4" />
        )}
      </div>
      <input
        ref={createInputRef}
        value={createName}
        onChange={(event) => setCreateName(event.target.value)}
        onBlur={finalizeCreate}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            void finalizeCreate()
          }
          if (event.key === "Escape") {
            event.preventDefault()
            cancelCreate()
          }
        }}
        className="h-6 flex-1 rounded-sm border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      />
    </div>
  )
}

type DrawingItemProps = {
  item: Drawing
  depth: number
  isActive: boolean
  open: boolean
  onDragStart: (event: DragEvent<HTMLAnchorElement>) => void
  onDragEnd: () => void
  onDelete: (id: string) => void
}

function DrawingItem({
  item,
  depth,
  isActive,
  open,
  onDragStart,
  onDragEnd,
  onDelete,
}: DrawingItemProps) {
  return (
    <div
      className="group flex items-center gap-0.5 py-0.5"
      style={open ? { paddingLeft: depth * 12 + 4 } : undefined}
    >
      <Link
        to="/draw/$id"
        params={{ id: item.id }}
        className={cn(
          "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
          isActive
            ? "bg-accent text-accent-foreground font-medium"
            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
          !open && "justify-center px-0",
        )}
        draggable={open}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <File className="h-4 w-4 shrink-0" />
        {open && <span className="truncate">{item.name}</span>}
      </Link>
      {open && (
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void onDelete(item.id)
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="sr-only">Delete drawing</span>
        </button>
      )}
    </div>
  )
}

type FolderItemProps = {
  folder: FolderType
  depth: number
  isExpanded: boolean
  isActive: boolean
  hasChildren: boolean
  isDropTarget: boolean
  open: boolean
  childFolders: FolderType[]
  folderDrawings: Drawing[]
  currentDrawingId: string
  expandedFolders: Set<string>
  activeFolderId: string | null
  dropTarget: DropTarget
  folderChildren: Map<string | null, FolderType[]>
  drawingsByFolder: Map<string | null, Drawing[]>
  createDraft: { type: "drawing" | "folder"; parentId: string | null } | null
  createName: string
  setCreateName: (name: string) => void
  finalizeCreate: () => void
  cancelCreate: () => void
  createInputRef: React.RefObject<HTMLInputElement | null>
  toggleFolder: (id: string) => void
  setActiveFolderId: (id: string | null) => void
  onDragStart: (item: DragItem) => (event: DragEvent<HTMLElement>) => void
  onDragEnd: () => void
  onDragOver: (event: DragEvent<HTMLElement>) => void
  onDragLeave: () => void
  onDrop: (event: DragEvent<HTMLElement>) => void
  onDeleteDrawing: (id: string) => void
}

function FolderItem({
  folder,
  depth,
  isExpanded,
  isActive,
  hasChildren,
  isDropTarget,
  open,
  childFolders,
  folderDrawings,
  currentDrawingId,
  expandedFolders,
  activeFolderId,
  dropTarget,
  folderChildren,
  drawingsByFolder,
  createDraft,
  createName,
  setCreateName,
  finalizeCreate,
  cancelCreate,
  createInputRef,
  toggleFolder,
  setActiveFolderId,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  onDeleteDrawing,
}: FolderItemProps) {
  return (
    <div
      className={cn(
        "rounded-md border border-transparent transition-colors",
        isDropTarget ? "bg-accent/30 ring-1 ring-primary/30" : "",
      )}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
      <div
        className="flex w-full items-center gap-0.5 rounded-md py-0.5"
        style={open ? { paddingLeft: depth * 12 + 4 } : undefined}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <button
          type="button"
          onClick={() => toggleFolder(folder.id)}
          className={cn(
            "flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
            !hasChildren && "opacity-30",
          )}
          disabled={!hasChildren}
        >
          <ChevronRight
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              isExpanded && "rotate-90",
            )}
          />
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveFolderId(folder.id)
            toggleFolder(folder.id)
          }}
          className={cn(
            "flex flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors",
            isActive
              ? "bg-accent text-accent-foreground font-medium"
              : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            !open && "justify-center px-0",
          )}
          draggable={open}
          onDragStart={onDragStart({ type: "folder", id: folder.id })}
          onDragEnd={onDragEnd}
        >
          <Folder className="h-4 w-4 shrink-0" />
          {open && <span className="truncate">{folder.name}</span>}
        </button>
      </div>
      {isExpanded && (
        /* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */
        <div
          className="ml-3 border-l border-border/40 pl-1"
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <CreateRow
            depth={depth + 1}
            parentId={folder.id}
            createDraft={createDraft}
            createName={createName}
            setCreateName={setCreateName}
            finalizeCreate={finalizeCreate}
            cancelCreate={cancelCreate}
            createInputRef={createInputRef}
            open={open}
          />
          {childFolders.map((child) => {
            const nestedChildFolders = folderChildren.get(child.id) ?? []
            const nestedFolderDrawings = drawingsByFolder.get(child.id) ?? []
            const nestedIsExpanded = expandedFolders.has(child.id)
            const nestedIsActive = activeFolderId === child.id
            const nestedHasChildren =
              nestedChildFolders.length > 0 || nestedFolderDrawings.length > 0
            const nestedIsDropTarget =
              dropTarget?.type === "folder" && dropTarget.id === child.id

            return (
              <FolderItem
                key={child.id}
                folder={child}
                depth={depth + 1}
                isExpanded={nestedIsExpanded}
                isActive={nestedIsActive}
                hasChildren={nestedHasChildren}
                isDropTarget={nestedIsDropTarget}
                open={open}
                childFolders={nestedChildFolders}
                folderDrawings={nestedFolderDrawings}
                currentDrawingId={currentDrawingId}
                expandedFolders={expandedFolders}
                activeFolderId={activeFolderId}
                dropTarget={dropTarget}
                folderChildren={folderChildren}
                drawingsByFolder={drawingsByFolder}
                createDraft={createDraft}
                createName={createName}
                setCreateName={setCreateName}
                finalizeCreate={finalizeCreate}
                cancelCreate={cancelCreate}
                createInputRef={createInputRef}
                toggleFolder={toggleFolder}
                setActiveFolderId={setActiveFolderId}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragOver={(e) =>
                  onDragOver(e as unknown as DragEvent<HTMLElement>)
                }
                onDragLeave={onDragLeave}
                onDrop={(e) => onDrop(e as unknown as DragEvent<HTMLElement>)}
                onDeleteDrawing={onDeleteDrawing}
              />
            )
          })}
          {folderDrawings.map((item) => (
            <DrawingItem
              key={item.id}
              item={item}
              depth={depth + 1}
              isActive={item.id === currentDrawingId}
              open={open}
              onDragStart={onDragStart({ type: "drawing", id: item.id })}
              onDragEnd={onDragEnd}
              onDelete={onDeleteDrawing}
            />
          ))}
        </div>
      )}
    </div>
  )
}

const getSession = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => context.session)

export const Route = createFileRoute("/draw")({
  server: {
    middleware: [authMiddleware],
  },
  beforeLoad: async () => {
    const setupComplete = await isSetupComplete()
    if (!setupComplete) {
      throw redirect({ to: "/setup" })
    }
  },
  loader: async () => {
    const [drawings, folders, session] = await Promise.all([
      getDrawings(),
      getFolders(),
      getSession(),
    ])

    return { drawings, folders, session }
  },
  component: DrawLayout,
})

function DrawLayout() {
  const { drawings, folders, session } = Route.useLoaderData()

  return (
    <SidebarProvider defaultOpen>
      <DrawLayoutInner
        drawings={drawings}
        folders={folders}
        session={session}
      />
    </SidebarProvider>
  )
}

function DrawLayoutInner({
  drawings,
  folders,
  session,
}: {
  drawings: Drawing[]
  folders: FolderType[]
  session: Awaited<ReturnType<typeof getSession>>
}) {
  const navigate = useNavigate()
  const { open } = useSidebar()
  const params = Route.useParams() as { id?: string }
  const currentDrawingId = params.id ?? ""

  const [localDrawings, setLocalDrawings] = useState(drawings)
  const [localFolders, setLocalFolders] = useState(folders)
  const currentDrawing = localDrawings.find((d) => d.id === currentDrawingId)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(
    currentDrawing?.folderId ?? null,
  )
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders.map((folder) => folder.id)),
  )
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [createDraft, setCreateDraft] = useState<{
    type: "drawing" | "folder"
    parentId: string | null
  } | null>(null)
  const [createName, setCreateName] = useState("")

  const createInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    setLocalDrawings(drawings)
  }, [drawings])

  useEffect(() => {
    setLocalFolders(folders)
  }, [folders])

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      for (const folder of folders) {
        next.add(folder.id)
      }
      return next
    })
  }, [folders])

  useEffect(() => {
    if (createDraft && open) {
      requestAnimationFrame(() => {
        createInputRef.current?.focus()
        createInputRef.current?.select()
      })
    }
  }, [createDraft, open])

  const handleDeleteDrawing = async (drawingId: string) => {
    if (!confirm("Are you sure you want to delete this drawing?")) {
      return
    }
    await deleteDrawing({ data: drawingId })
    const remaining = localDrawings.filter((item) => item.id !== drawingId)
    setLocalDrawings(remaining)

    if (drawingId === currentDrawingId) {
      if (remaining.length > 0) {
        navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
      } else {
        const newId = await createDrawing({ data: {} })
        navigate({ to: "/draw/$id", params: { id: newId } })
      }
    }
  }

  const startCreate = (type: "drawing" | "folder", parentId: string | null) => {
    if (!open) return
    setCreateDraft({ type, parentId })
    setCreateName(type === "drawing" ? "Untitled" : "New folder")
    if (parentId) {
      setExpandedFolders((prev) => new Set(prev).add(parentId))
    }
  }

  const cancelCreate = () => {
    setCreateDraft(null)
    setCreateName("")
  }

  const finalizeCreate = async () => {
    if (!createDraft) return
    const name = createName.trim()
    if (!name) {
      cancelCreate()
      return
    }

    if (createDraft.type === "drawing") {
      const newId = await createDrawing({
        data: { name, folderId: createDraft.parentId ?? undefined },
      })
      cancelCreate()
      navigate({ to: "/draw/$id", params: { id: newId } })
      return
    }

    const newFolder = await createFolder({
      data: { name, parentId: createDraft.parentId },
    })
    setLocalFolders((prev) => [...prev, newFolder])
    setExpandedFolders((prev) => new Set(prev).add(newFolder.id))
    setActiveFolderId(newFolder.id)
    cancelCreate()
  }

  const handleSignOut = async () => {
    await signOut()
    navigate({ to: "/login" })
  }

  const folderById = useMemo(
    () => new Map(localFolders.map((folder) => [folder.id, folder])),
    [localFolders],
  )

  const isFolderDescendant = useCallback(
    (folderId: string, potentialParentId: string | null) => {
      let currentId = potentialParentId
      while (currentId) {
        if (currentId === folderId) {
          return true
        }
        currentId = folderById.get(currentId)?.parentId ?? null
      }
      return false
    },
    [folderById],
  )

  const getDragItem = (event: DragEvent) => {
    const raw = event.dataTransfer.getData("application/x-excalidraw-item")
    if (!raw) return dragItem
    try {
      const parsed = JSON.parse(raw) as DragItem
      if (
        parsed?.id &&
        (parsed.type === "drawing" || parsed.type === "folder")
      ) {
        return parsed
      }
    } catch {
      return dragItem
    }
    return dragItem
  }

  const handleDragStart = (item: DragItem) => (event: DragEvent) => {
    if (!open) return
    setDragItem(item)
    event.dataTransfer.effectAllowed = "move"
    event.dataTransfer.setData("text/plain", item.id)
    event.dataTransfer.setData(
      "application/x-excalidraw-item",
      JSON.stringify(item),
    )
  }

  const handleDragEnd = () => {
    setDragItem(null)
    setDropTarget(null)
  }

  const handleDragOverTarget =
    (target: DropTarget, options?: { onlySelf?: boolean }) =>
    (event: DragEvent) => {
      if (!open) return
      if (options?.onlySelf && event.currentTarget !== event.target) {
        return
      }
      const item = dragItem ?? getDragItem(event)
      if (!item) return
      if (
        item.type === "folder" &&
        target?.type === "folder" &&
        isFolderDescendant(item.id, target.id)
      ) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      event.dataTransfer.dropEffect = "move"
      setDropTarget(target)
    }

  const handleDragLeave = () => {
    setDropTarget(null)
  }

  const handleDrop =
    (target: DropTarget, options?: { onlySelf?: boolean }) =>
    async (event: DragEvent) => {
      if (!open) return
      if (options?.onlySelf && event.currentTarget !== event.target) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const item = getDragItem(event)
      setDropTarget(null)
      setDragItem(null)
      if (!item) return

      if (item.type === "folder") {
        const newParentId = target?.type === "folder" ? target.id : null
        if (newParentId === item.id) return
        if (isFolderDescendant(item.id, newParentId)) return

        await updateFolder({
          data: { id: item.id, parentId: newParentId },
        })
        setLocalFolders((prev) =>
          prev.map((folder) =>
            folder.id === item.id
              ? { ...folder, parentId: newParentId }
              : folder,
          ),
        )
        if (newParentId) {
          setExpandedFolders((prev) => new Set(prev).add(newParentId))
        }
        return
      }

      if (item.type === "drawing") {
        const newFolderId = target?.type === "folder" ? target.id : null
        const current = localDrawings.find((entry) => entry.id === item.id)
        if (current?.folderId === newFolderId) return

        await updateDrawing({
          data: { id: item.id, updateData: { folderId: newFolderId } },
        })
        setLocalDrawings((prev) =>
          prev.map((entry) =>
            entry.id === item.id ? { ...entry, folderId: newFolderId } : entry,
          ),
        )
        if (newFolderId) {
          setExpandedFolders((prev) => new Set(prev).add(newFolderId))
        }
      }
    }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(folderId)) {
        next.delete(folderId)
      } else {
        next.add(folderId)
      }
      return next
    })
  }

  const folderChildren = useMemo(() => {
    const map = new Map<string | null, FolderType[]>()
    for (const folder of localFolders) {
      const parentId = folder.parentId ?? null
      if (!map.has(parentId)) {
        map.set(parentId, [])
      }
      map.get(parentId)?.push(folder)
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [localFolders])

  const drawingsByFolder = useMemo(() => {
    const map = new Map<string | null, Drawing[]>()
    const folderIds = new Set(localFolders.map((folder) => folder.id))
    for (const item of localDrawings) {
      const folderId =
        item.folderId && folderIds.has(item.folderId) ? item.folderId : null
      if (!map.has(folderId)) {
        map.set(folderId, [])
      }
      map.get(folderId)?.push(item)
    }
    for (const entries of map.values()) {
      entries.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [localDrawings, localFolders])

  const rootDrawings = drawingsByFolder.get(null) ?? []
  const rootFolders = folderChildren.get(null) ?? []
  const isAdmin = session?.user.role === "admin"
  const userEmail = session?.user.email ?? ""

  return (
    <div className="h-screen w-full bg-muted/20 p-2">
      <SidebarOverlay />
      {!open && (
        <div className="absolute left-4 top-4 z-40">
          <SidebarTrigger className="h-8 w-8 rounded-md border bg-background shadow-sm" />
        </div>
      )}
      <div className="flex h-full w-full overflow-hidden rounded-xl border bg-background shadow-sm">
        <Sidebar variant="sidebar" className="border-r border-border/40">
          <SidebarHeader className="h-14 justify-center border-b border-border/40 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <span className="text-xs font-bold">E</span>
                </div>
                {open && (
                  <span className="font-semibold text-sm">Excalidraw</span>
                )}
              </div>
            </div>
          </SidebarHeader>

          <div className="px-4 py-2">
            {open && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 justify-start px-2 text-xs font-normal"
                  onClick={() => startCreate("drawing", activeFolderId)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  New Drawing
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 w-8 px-0"
                  title="New Folder"
                  onClick={() => startCreate("folder", activeFolderId)}
                >
                  <Folder className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>

          <SidebarContent className="px-2">
            {/* biome-ignore lint/a11y/noStaticElementInteractions: Drag-and-drop target */}
            <div
              onDragOver={handleDragOverTarget(
                { type: "root" },
                {
                  onlySelf: true,
                },
              )}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop({ type: "root" }, { onlySelf: true })}
              className={cn(
                "min-h-full rounded-md border border-transparent transition-all",
                dropTarget?.type === "root"
                  ? "bg-accent/30 ring-1 ring-primary/30"
                  : "",
              )}
            >
              <button
                type="button"
                onClick={() => setActiveFolderId(null)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors mb-1",
                  activeFolderId === null
                    ? "bg-accent text-accent-foreground font-medium"
                    : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <span className="truncate">All Drawings</span>
              </button>

              <CreateRow
                depth={0}
                parentId={null}
                createDraft={createDraft}
                createName={createName}
                setCreateName={setCreateName}
                finalizeCreate={finalizeCreate}
                cancelCreate={cancelCreate}
                createInputRef={createInputRef}
                open={open}
              />
              {rootFolders.map((folder) => {
                const childFolders = folderChildren.get(folder.id) ?? []
                const folderDrawingsForItem =
                  drawingsByFolder.get(folder.id) ?? []
                const isExpanded = expandedFolders.has(folder.id)
                const isActive = activeFolderId === folder.id
                const hasChildren =
                  childFolders.length > 0 || folderDrawingsForItem.length > 0
                const isFolderDropTarget =
                  dropTarget?.type === "folder" && dropTarget.id === folder.id

                return (
                  <FolderItem
                    key={folder.id}
                    folder={folder}
                    depth={0}
                    isExpanded={isExpanded}
                    isActive={isActive}
                    hasChildren={hasChildren}
                    isDropTarget={isFolderDropTarget}
                    open={open}
                    childFolders={childFolders}
                    folderDrawings={folderDrawingsForItem}
                    currentDrawingId={currentDrawingId}
                    expandedFolders={expandedFolders}
                    activeFolderId={activeFolderId}
                    dropTarget={dropTarget}
                    folderChildren={folderChildren}
                    drawingsByFolder={drawingsByFolder}
                    createDraft={createDraft}
                    createName={createName}
                    setCreateName={setCreateName}
                    finalizeCreate={finalizeCreate}
                    cancelCreate={cancelCreate}
                    createInputRef={createInputRef}
                    toggleFolder={toggleFolder}
                    setActiveFolderId={setActiveFolderId}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDragOver={handleDragOverTarget({
                      type: "folder",
                      id: folder.id,
                    })}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop({ type: "folder", id: folder.id })}
                    onDeleteDrawing={handleDeleteDrawing}
                  />
                )
              })}
              {rootDrawings.map((item) => (
                <DrawingItem
                  key={item.id}
                  item={item}
                  depth={0}
                  isActive={item.id === currentDrawingId}
                  open={open}
                  onDragStart={handleDragStart({
                    type: "drawing",
                    id: item.id,
                  })}
                  onDragEnd={handleDragEnd}
                  onDelete={handleDeleteDrawing}
                />
              ))}
            </div>
          </SidebarContent>

          <SidebarFooter className="border-t border-border/40 p-4">
            {open ? (
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-xs font-medium text-foreground">
                    {userEmail}
                  </span>
                  <span className="truncate text-[10px] text-muted-foreground">
                    {isAdmin ? "Admin" : "User"}
                  </span>
                </div>
                <div className="flex items-center">
                  {isAdmin && (
                    <Button
                      asChild
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      <Link to="/admin">
                        <Settings className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={handleSignOut}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={handleSignOut}
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </div>
            )}
          </SidebarFooter>
        </Sidebar>

        <SidebarInset className="bg-background border-0 rounded-none shadow-none">
          <Outlet />
        </SidebarInset>
      </div>
    </div>
  )
}
