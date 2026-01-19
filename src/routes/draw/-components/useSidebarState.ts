import { useNavigate } from "@tanstack/react-router"
import type { DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createDrawing, deleteDrawing, updateDrawing } from "@/server/drawings"
import { createFolder, updateFolder } from "@/server/folders"
import type {
  DragItem,
  Drawing,
  DropTarget,
  FolderType,
} from "./SidebarContext"

type UseSidebarStateProps = {
  drawings: Drawing[]
  folders: FolderType[]
  currentDrawingId: string
  open: boolean
}

export function useSidebarState({
  drawings,
  folders,
  currentDrawingId,
  open,
}: UseSidebarStateProps) {
  const navigate = useNavigate()

  // Local state synced with props
  const [localDrawings, setLocalDrawings] = useState(drawings)
  const [localFolders, setLocalFolders] = useState(folders)

  useEffect(() => setLocalDrawings(drawings), [drawings])
  useEffect(() => setLocalFolders(folders), [folders])

  // UI state
  const currentDrawing = localDrawings.find((d) => d.id === currentDrawingId)
  const [activeFolderId, setActiveFolderId] = useState<string | null>(
    currentDrawing?.folderId ?? null,
  )
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders.map((f) => f.id)),
  )

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      folders.forEach((f) => next.add(f.id))
      return next
    })
  }, [folders])

  // Derived data
  const folderById = useMemo(
    () => new Map(localFolders.map((f) => [f.id, f])),
    [localFolders],
  )

  const folderChildren = useMemo(() => {
    const map = new Map<string | null, FolderType[]>()
    for (const folder of localFolders) {
      const pid = folder.parentId ?? null
      if (!map.has(pid)) map.set(pid, [])
      map.get(pid)!.push(folder)
    }
    map.forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)))
    return map
  }, [localFolders])

  const drawingsByFolder = useMemo(() => {
    const map = new Map<string | null, Drawing[]>()
    const folderIds = new Set(localFolders.map((f) => f.id))
    for (const d of localDrawings) {
      const fid = d.folderId && folderIds.has(d.folderId) ? d.folderId : null
      if (!map.has(fid)) map.set(fid, [])
      map.get(fid)!.push(d)
    }
    map.forEach((arr) => arr.sort((a, b) => a.name.localeCompare(b.name)))
    return map
  }, [localDrawings, localFolders])

  // Folder toggle
  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      next.has(folderId) ? next.delete(folderId) : next.add(folderId)
      return next
    })
  }, [])

  const expandFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => new Set(prev).add(folderId))
  }, [])

  // Create functionality
  const [createDraft, setCreateDraft] = useState<{
    type: "drawing" | "folder"
    parentId: string | null
  } | null>(null)
  const [createName, setCreateName] = useState("")
  const createInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (createDraft && open) {
      requestAnimationFrame(() => {
        createInputRef.current?.focus()
        createInputRef.current?.select()
      })
    }
  }, [createDraft, open])

  const startCreate = useCallback(
    (type: "drawing" | "folder") => {
      if (!open) return
      setCreateDraft({ type, parentId: activeFolderId })
      setCreateName(type === "drawing" ? "Untitled" : "New folder")
      if (activeFolderId) expandFolder(activeFolderId)
    },
    [open, activeFolderId, expandFolder],
  )

  const cancelCreate = useCallback(() => {
    setCreateDraft(null)
    setCreateName("")
  }, [])

  const finalizeCreate = useCallback(async () => {
    if (!createDraft) return
    const name = createName.trim()
    if (!name) return cancelCreate()

    if (createDraft.type === "drawing") {
      const newId = await createDrawing({
        data: { name, folderId: createDraft.parentId ?? undefined },
      })
      cancelCreate()
      navigate({ to: "/draw/$id", params: { id: newId } })
    } else {
      const newFolder = await createFolder({
        data: { name, parentId: createDraft.parentId },
      })
      setLocalFolders((prev) => [...prev, newFolder])
      expandFolder(newFolder.id)
      setActiveFolderId(newFolder.id)
      cancelCreate()
    }
  }, [createDraft, createName, cancelCreate, navigate, expandFolder])

  // Delete
  const deleteDrawingById = useCallback(
    async (drawingId: string) => {
      if (!confirm("Are you sure you want to delete this drawing?")) return
      await deleteDrawing({ data: drawingId })
      const remaining = localDrawings.filter((d) => d.id !== drawingId)
      setLocalDrawings(remaining)

      if (drawingId === currentDrawingId) {
        if (remaining.length > 0) {
          navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
        } else {
          const newId = await createDrawing({ data: {} })
          navigate({ to: "/draw/$id", params: { id: newId } })
        }
      }
    },
    [localDrawings, currentDrawingId, navigate],
  )

  // Drag and drop
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  const isDescendant = useCallback(
    (folderId: string, potentialParentId: string | null): boolean => {
      let id = potentialParentId
      while (id) {
        if (id === folderId) return true
        id = folderById.get(id)?.parentId ?? null
      }
      return false
    },
    [folderById],
  )

  const parseDragData = useCallback(
    (e: DragEvent): DragItem | null => {
      const raw = e.dataTransfer.getData("application/x-excalidraw-item")
      if (!raw) return dragItem
      try {
        const parsed = JSON.parse(raw) as DragItem
        if (
          parsed?.id &&
          (parsed.type === "drawing" || parsed.type === "folder")
        ) {
          return parsed
        }
      } catch {}
      return dragItem
    },
    [dragItem],
  )

  const handleDragStart = useCallback(
    (item: DragItem) => (e: DragEvent) => {
      if (!open) return
      setDragItem(item)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", item.id)
      e.dataTransfer.setData(
        "application/x-excalidraw-item",
        JSON.stringify(item),
      )
    },
    [open],
  )

  const handleDragEnd = useCallback(() => {
    setDragItem(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback(
    (target: DropTarget) => (e: DragEvent) => {
      if (!open) return
      const item = dragItem ?? parseDragData(e)
      if (!item) return
      // Prevent dropping folder into itself or descendant
      if (
        item.type === "folder" &&
        target?.type === "folder" &&
        isDescendant(item.id, target.id)
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDropTarget(target)
    },
    [open, dragItem, parseDragData, isDescendant],
  )

  const handleDrop = useCallback(
    (target: DropTarget) => async (e: DragEvent) => {
      if (!open) return
      e.preventDefault()
      e.stopPropagation()

      const item = parseDragData(e)
      setDropTarget(null)
      setDragItem(null)
      if (!item) return

      const targetFolderId = target?.type === "folder" ? target.id : null

      if (item.type === "folder") {
        if (targetFolderId === item.id || isDescendant(item.id, targetFolderId))
          return
        await updateFolder({ data: { id: item.id, parentId: targetFolderId } })
        setLocalFolders((prev) =>
          prev.map((f) =>
            f.id === item.id ? { ...f, parentId: targetFolderId } : f,
          ),
        )
      } else {
        const current = localDrawings.find((d) => d.id === item.id)
        if (current?.folderId === targetFolderId) return
        await updateDrawing({
          data: { id: item.id, updateData: { folderId: targetFolderId } },
        })
        setLocalDrawings((prev) =>
          prev.map((d) =>
            d.id === item.id ? { ...d, folderId: targetFolderId } : d,
          ),
        )
      }

      if (targetFolderId) expandFolder(targetFolderId)
    },
    [open, parseDragData, isDescendant, localDrawings, expandFolder],
  )

  const handleDragLeave = useCallback(() => setDropTarget(null), [])

  return {
    // Data
    folderChildren,
    drawingsByFolder,
    rootFolders: folderChildren.get(null) ?? [],
    rootDrawings: drawingsByFolder.get(null) ?? [],

    // UI state
    currentDrawingId,
    activeFolderId,
    setActiveFolderId,
    expandedFolders,
    toggleFolder,
    dropTarget,

    // Create
    createDraft,
    createName,
    setCreateName,
    createInputRef,
    startCreate,
    cancelCreate,
    finalizeCreate,

    // Drag & drop
    onDragStart: handleDragStart,
    onDragEnd: handleDragEnd,
    onDragOver: handleDragOver,
    onDragLeave: handleDragLeave,
    onDrop: handleDrop,

    // Actions
    onDeleteDrawing: deleteDrawingById,
  }
}
