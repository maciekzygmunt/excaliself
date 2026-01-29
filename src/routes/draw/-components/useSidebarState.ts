import { useNavigate, useParams, useRouter } from "@tanstack/react-router"
import type { DragEvent } from "react"
import { useEffect, useMemo, useRef, useState } from "react"
import { createDrawing, deleteDrawing, updateDrawing } from "@/server/drawings"
import { createFolder, deleteFolder, updateFolder } from "@/server/folders"
import type {
  ConfirmDialog,
  DragItem,
  Drawing,
  DropTarget,
  FolderType,
} from "./SidebarContext"

type UseSidebarStateProps = {
  drawings: Drawing[]
  folders: FolderType[]
}

export function useSidebarState({ drawings, folders }: UseSidebarStateProps) {
  const navigate = useNavigate()
  const router = useRouter()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })

  // UI state
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(),
  )
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  // Create state
  const [createDraft, setCreateDraft] = useState<{
    type: "drawing" | "folder"
    parentId: string | null
  } | null>(null)
  const [createName, setCreateName] = useState("")
  const createInputRef = useRef<HTMLInputElement | null>(null)

  // Derived data - group items by parent
  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  )

  const folderChildren = useMemo(() => {
    const map = new Map<string | null, FolderType[]>()
    for (const folder of folders) {
      const pid = folder.parentId ?? null
      const arr = map.get(pid) ?? []
      if (!map.has(pid)) map.set(pid, arr)
      arr.push(folder)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [folders])

  const drawingsByFolder = useMemo(() => {
    const map = new Map<string | null, Drawing[]>()
    const folderIds = new Set(folders.map((f) => f.id))
    for (const d of drawings) {
      const fid = d.folderId && folderIds.has(d.folderId) ? d.folderId : null
      const arr = map.get(fid) ?? []
      if (!map.has(fid)) map.set(fid, arr)
      arr.push(d)
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.name.localeCompare(b.name))
    }
    return map
  }, [drawings, folders])

  // Folder expand/collapse
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

  const expandFolder = (folderId: string) => {
    setExpandedFolders((prev) => new Set(prev).add(folderId))
  }

  // Create actions
  const startCreate = (
    type: "drawing" | "folder",
    parentId?: string | null,
  ) => {
    setCreateDraft({ type, parentId: parentId ?? null })
    setCreateName(type === "drawing" ? "Untitled" : "New folder")
    if (parentId) expandFolder(parentId)
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
    } else {
      await createFolder({ data: { name, parentId: createDraft.parentId } })
      cancelCreate()
      router.invalidate()
    }
  }

  useEffect(() => {
    if (!createDraft) return
    const frame = requestAnimationFrame(() => {
      createInputRef.current?.focus()
      createInputRef.current?.select()
    })
    return () => cancelAnimationFrame(frame)
  }, [createDraft])

  const closeConfirmDialog = () => setConfirmDialog(null)

  const openConfirmDialog = (dialog: Exclude<ConfirmDialog, null>) => {
    setConfirmDialog({
      ...dialog,
      onConfirm: async () => {
        setConfirmDialog(null)
        await dialog.onConfirm()
      },
    })
  }

  // Delete actions
  const onDeleteDrawing = async (drawingId: string) => {
    openConfirmDialog({
      title: "Delete drawing?",
      description: "Are you sure you want to delete this drawing?",
      onConfirm: async () => {
        await deleteDrawing({ data: drawingId })

        if (drawingId === currentDrawingId) {
          const remaining = drawings.filter((d) => d.id !== drawingId)
          if (remaining.length > 0) {
            navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
          } else {
            const newId = await createDrawing({ data: {} })
            navigate({ to: "/draw/$id", params: { id: newId } })
          }
        } else {
          router.invalidate()
        }
      },
    })
  }

  const onDeleteFolder = async (folderId: string) => {
    const hasItems =
      (drawingsByFolder.get(folderId)?.length ?? 0) > 0 ||
      (folderChildren.get(folderId)?.length ?? 0) > 0

    const message = hasItems
      ? "This folder contains items. Delete folder and move items to root?"
      : "Delete this folder?"

    openConfirmDialog({
      title: "Delete folder?",
      description: message,
      onConfirm: async () => {
        await deleteFolder({ data: folderId })
        router.invalidate()
      },
    })
  }

  // Rename
  const onRename = async (item: DragItem, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (item.type === "drawing") {
      await updateDrawing({
        data: { id: item.id, updateData: { name: trimmed } },
      })
    } else {
      await updateFolder({ data: { id: item.id, name: trimmed } })
    }
    router.invalidate()
  }

  // Drag and drop helpers
  const isDescendant = (
    folderId: string,
    potentialParentId: string | null,
  ): boolean => {
    let id = potentialParentId
    while (id) {
      if (id === folderId) return true
      id = folderById.get(id)?.parentId ?? null
    }
    return false
  }

  const onDragStart = (item: DragItem) => (e: DragEvent) => {
    setDragItem(item)
    e.dataTransfer.effectAllowed = "move"
    e.dataTransfer.setData("text/plain", item.id)
    e.dataTransfer.setData("application/x-sidebar-item", JSON.stringify(item))
  }

  const onDragEnd = () => {
    setDragItem(null)
    setDropTarget(null)
  }

  const onDragOver = (target: DropTarget) => (e: DragEvent) => {
    if (!dragItem) return

    // Prevent dropping folder into itself or descendant
    if (
      dragItem.type === "folder" &&
      target?.type === "folder" &&
      (dragItem.id === target.id || isDescendant(dragItem.id, target.id))
    ) {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = "move"
    setDropTarget(target)
  }

  const onDragLeave = () => setDropTarget(null)

  const onDrop = (target: DropTarget) => async (e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!dragItem) return

    const targetFolderId =
      target?.type === "folder" && target.position === "inside"
        ? target.id
        : null

    setDropTarget(null)
    setDragItem(null)

    if (dragItem.type === "folder") {
      if (
        targetFolderId === dragItem.id ||
        isDescendant(dragItem.id, targetFolderId)
      ) {
        return
      }
      await updateFolder({
        data: { id: dragItem.id, parentId: targetFolderId },
      })
    } else {
      const current = drawings.find((d) => d.id === dragItem.id)
      if (current?.folderId === targetFolderId) return
      await updateDrawing({
        data: { id: dragItem.id, updateData: { folderId: targetFolderId } },
      })
    }

    if (targetFolderId) expandFolder(targetFolderId)
    router.invalidate()
  }

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
    confirmDialog,
    closeConfirmDialog,

    // Create
    createDraft,
    createName,
    setCreateName,
    createInputRef,
    startCreate,
    cancelCreate,
    finalizeCreate,

    // Drag & drop
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,

    // Actions
    onDeleteDrawing,
    onDeleteFolder,
    onRename,
  }
}
