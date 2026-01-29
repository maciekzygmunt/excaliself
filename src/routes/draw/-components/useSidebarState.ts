import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { DragEvent } from "react"
import { useMemo, useState } from "react"
import { getDrawings, updateDrawing } from "@/server/drawings"
import { getFolders, updateFolder } from "@/server/folders"
import type {
  DragItem,
  Drawing,
  DropTarget,
  FolderType,
  TreeNode,
} from "./SidebarContext"

export function useSidebarState() {
  const queryClient = useQueryClient()

  // Data fetching
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings"],
    queryFn: () => getDrawings(),
  })
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: () => getFolders(),
  })

  // UI state
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)

  // Derived data
  const folderById = useMemo(
    () => new Map(folders.map((f) => [f.id, f])),
    [folders],
  )

  const tree = useMemo(() => {
    const folderNodes = new Map<string, TreeNode & { type: "folder" }>()
    for (const f of folders) {
      folderNodes.set(f.id, { type: "folder", folder: f, children: [] })
    }

    const root: TreeNode[] = []

    for (const f of folders) {
      const node = folderNodes.get(f.id)
      if (!node) continue
      const parent = f.parentId ? folderNodes.get(f.parentId) : null
      if (parent) parent.children.push(node)
      else root.push(node)
    }

    for (const d of drawings) {
      const node: TreeNode = { type: "drawing", drawing: d }
      const parent = d.folderId ? folderNodes.get(d.folderId) : null
      if (parent) parent.children.push(node)
      else root.push(node)
    }

    const sortNodes = (nodes: TreeNode[]) => {
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1
        const nameA = a.type === "folder" ? a.folder.name : a.drawing.name
        const nameB = b.type === "folder" ? b.folder.name : b.drawing.name
        return nameA.localeCompare(nameB)
      })
      for (const n of nodes) {
        if (n.type === "folder") sortNodes(n.children)
      }
    }
    sortNodes(root)

    return { root, folderNodes }
  }, [drawings, folders])

  // --- Mutations ---

  const renameDrawingMutation = useMutation({
    mutationFn: updateDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["drawings"] })
      const previous = queryClient.getQueryData<Drawing[]>(["drawings"])
      queryClient.setQueryData<Drawing[]>(["drawings"], (old = []) =>
        old.map((d) =>
          d.id === variables.data.id
            ? { ...d, name: variables.data.updateData.name ?? d.name }
            : d,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["drawings"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const renameFolderMutation = useMutation({
    mutationFn: updateFolder,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["folders"] })
      const previous = queryClient.getQueryData<FolderType[]>(["folders"])
      queryClient.setQueryData<FolderType[]>(["folders"], (old = []) =>
        old.map((f) =>
          f.id === variables.data.id
            ? { ...f, name: variables.data.name ?? f.name }
            : f,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["folders"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] })
    },
  })

  const moveDrawingMutation = useMutation({
    mutationFn: updateDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["drawings"] })
      const previous = queryClient.getQueryData<Drawing[]>(["drawings"])
      queryClient.setQueryData<Drawing[]>(["drawings"], (old = []) =>
        old.map((d) =>
          d.id === variables.data.id
            ? {
                ...d,
                folderId: variables.data.updateData.folderId ?? d.folderId,
              }
            : d,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["drawings"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const moveFolderMutation = useMutation({
    mutationFn: updateFolder,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["folders"] })
      const previous = queryClient.getQueryData<FolderType[]>(["folders"])
      queryClient.setQueryData<FolderType[]>(["folders"], (old = []) =>
        old.map((f) =>
          f.id === variables.data.id
            ? { ...f, parentId: variables.data.parentId ?? f.parentId }
            : f,
        ),
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(["folders"], context?.previous)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["folders"] })
    },
  })

  // Rename
  const onRename = async (item: DragItem, newName: string) => {
    const trimmed = newName.trim()
    if (!trimmed) return

    if (item.type === "drawing") {
      renameDrawingMutation.mutate({
        data: { id: item.id, updateData: { name: trimmed } },
      })
    } else {
      renameFolderMutation.mutate({
        data: { id: item.id, name: trimmed },
      })
    }
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
      moveFolderMutation.mutate({
        data: { id: dragItem.id, parentId: targetFolderId },
      })
    } else {
      const current = drawings.find((d) => d.id === dragItem.id)
      if (current?.folderId === targetFolderId) return
      moveDrawingMutation.mutate({
        data: { id: dragItem.id, updateData: { folderId: targetFolderId } },
      })
    }
  }

  return {
    // Data
    tree: tree.root,

    // UI state
    dropTarget,

    // Drag & drop
    onDragStart,
    onDragEnd,
    onDragOver,
    onDragLeave,
    onDrop,

    // Actions
    onRename,
  }
}
