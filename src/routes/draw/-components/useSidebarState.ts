import { useNavigate } from "@tanstack/react-router"
import type { DragEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createDrawing, deleteDrawing, updateDrawing } from "@/server/drawings"
import { createFolder, deleteFolder, updateFolder } from "@/server/folders"
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
}

export function useSidebarState({
  drawings,
  folders,
  currentDrawingId,
}: UseSidebarStateProps) {
  const navigate = useNavigate()

  // Local state synced with props
  const [localDrawings, setLocalDrawings] = useState(drawings)
  const [localFolders, setLocalFolders] = useState(folders)

  useEffect(() => setLocalDrawings(drawings), [drawings])
  useEffect(() => setLocalFolders(folders), [folders])

  // UI state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(folders.map((f) => f.id)),
  )

  useEffect(() => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      for (const f of folders) {
        next.add(f.id)
      }
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
      const arr = map.get(pid) ?? []
      if (!map.has(pid)) map.set(pid, arr)
      arr.push(folder)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [localFolders])

  const drawingsByFolder = useMemo(() => {
    const map = new Map<string | null, Drawing[]>()
    const folderIds = new Set(localFolders.map((f) => f.id))
    for (const d of localDrawings) {
      const fid = d.folderId && folderIds.has(d.folderId) ? d.folderId : null
      const arr = map.get(fid) ?? []
      if (!map.has(fid)) map.set(fid, arr)
      arr.push(d)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
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
    if (createDraft) {
      requestAnimationFrame(() => {
        createInputRef.current?.focus()
        createInputRef.current?.select()
      })
    }
  }, [createDraft])

  const startCreate = useCallback(
    (type: "drawing" | "folder", parentId?: string | null) => {
      setCreateDraft({ type, parentId: parentId ?? null })
      setCreateName(type === "drawing" ? "Untitled" : "New folder")
      if (parentId) expandFolder(parentId)
    },
    [expandFolder],
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
      cancelCreate()
    }
  }, [createDraft, createName, cancelCreate, navigate, expandFolder])

  // Delete drawing
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

  // Delete folder
  const deleteFolderById = useCallback(
    async (folderId: string) => {
      const folderDrawings = drawingsByFolder.get(folderId) ?? []
      const childFolders = folderChildren.get(folderId) ?? []

      if (folderDrawings.length > 0 || childFolders.length > 0) {
        if (
          !confirm(
            "This folder contains items. Delete folder and move items to root?",
          )
        )
          return
      } else {
        if (!confirm("Delete this folder?")) return
      }

      await deleteFolder({ data: folderId })
      setLocalFolders((prev) => prev.filter((f) => f.id !== folderId))
      // Move children to root
      setLocalDrawings((prev) =>
        prev.map((d) =>
          d.folderId === folderId ? { ...d, folderId: null } : d,
        ),
      )
      setLocalFolders((prev) =>
        prev.map((f) =>
          f.parentId === folderId ? { ...f, parentId: null } : f,
        ),
      )
    },
    [drawingsByFolder, folderChildren],
  )

  // Rename
  const handleRename = useCallback(async (item: DragItem, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (item.type === "drawing") {
      await updateDrawing({
        data: { id: item.id, updateData: { name: trimmed } },
      })
      setLocalDrawings((prev) =>
        prev.map((d) => (d.id === item.id ? { ...d, name: trimmed } : d)),
      )
    } else {
      await updateFolder({ data: { id: item.id, name: trimmed } })
      setLocalFolders((prev) =>
        prev.map((f) => (f.id === item.id ? { ...f, name: trimmed } : f)),
      )
    }
  }, [])

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
      setDragItem(item)
      e.dataTransfer.effectAllowed = "move"
      e.dataTransfer.setData("text/plain", item.id)
      e.dataTransfer.setData(
        "application/x-excalidraw-item",
        JSON.stringify(item),
      )
    },
    [],
  )

  const handleDragEnd = useCallback(() => {
    setDragItem(null)
    setDropTarget(null)
  }, [])

  const handleDragOver = useCallback(
    (target: DropTarget) => (e: DragEvent) => {
      const item = dragItem ?? parseDragData(e)
      if (!item) return
      // Prevent dropping folder into itself or descendant
      if (
        item.type === "folder" &&
        target?.type === "folder" &&
        (item.id === target.id || isDescendant(item.id, target.id))
      ) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = "move"
      setDropTarget(target)
    },
    [dragItem, parseDragData, isDescendant],
  )

  const handleDrop = useCallback(
    (target: DropTarget) => async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()

      const item = parseDragData(e)
      setDropTarget(null)
      setDragItem(null)
      if (!item) return

      const targetFolderId =
        target?.type === "folder" && target.position === "inside"
          ? target.id
          : null

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
    [parseDragData, isDescendant, localDrawings, expandFolder],
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
    expandedFolders,
    toggleFolder,
    dropTarget,
    dragItem,

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
    onDeleteFolder: deleteFolderById,
    onRename: handleRename,
  }
}
