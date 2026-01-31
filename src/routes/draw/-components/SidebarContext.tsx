import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useNavigate, useParams } from "@tanstack/react-router"
import type { DragEvent } from "react"
import { createContext, useContext, useMemo, useState } from "react"
import { toast } from "sonner"
import {
  createDrawing,
  deleteDrawing,
  getDrawings,
  updateDrawing,
} from "@/server/drawings"
import { deleteFolder, getFolders, updateFolder } from "@/server/folders"

export type Drawing = Awaited<ReturnType<typeof getDrawings>>[number]
export type FolderType = Awaited<ReturnType<typeof getFolders>>[number]

export type TreeNode =
  | { type: "folder"; folder: FolderType; children: TreeNode[] }
  | { type: "drawing"; drawing: Drawing }

export type DragItem = { type: "drawing" | "folder"; id: string }
export type DropTarget =
  | { type: "root" }
  | { type: "folder"; id: string; position: "inside" | "above" | "below" }
  | null

export type ConfirmDialog = {
  title: string
  description: string
  onConfirm: () => void | Promise<void>
} | null

export type SidebarContextValue = {
  // Data
  tree: TreeNode[]

  // UI state
  dropTarget: DropTarget

  // Drag & drop
  onDragStart: (item: DragItem) => (e: DragEvent) => void
  onDragEnd: () => void
  onDragOver: (target: DropTarget) => (e: DragEvent) => void
  onDragLeave: () => void
  onDrop: (target: DropTarget) => (e: DragEvent) => void

  // Actions
  onDeleteDrawing: (id: string) => void
  onDeleteFolder: (id: string, hasChildren: boolean) => void

  // Dialog
  confirmDialog: ConfirmDialog
  showConfirmDialog: (dialog: NonNullable<ConfirmDialog>) => void
  closeConfirmDialog: () => void
}

const SidebarContext = createContext<SidebarContextValue | null>(null)

export function SidebarContextProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const { id: currentDrawingId } = useParams({ from: "/draw/$id" })

  // --- Data fetching ---
  const { data: drawings = [] } = useQuery({
    queryKey: ["drawings"],
    queryFn: () => getDrawings(),
  })
  const { data: folders = [] } = useQuery({
    queryKey: ["folders"],
    queryFn: () => getFolders(),
  })

  // --- UI state ---
  const [dragItem, setDragItem] = useState<DragItem | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)

  // --- Derived data ---
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

    return root
  }, [drawings, folders])

  // --- Move mutations ---
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

  // --- Delete mutations ---
  const deleteDrawingMutation = useMutation({
    mutationFn: deleteDrawing,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: ["drawings"] })
      const previous = queryClient.getQueryData<Drawing[]>(["drawings"])
      queryClient.setQueryData<Drawing[]>(["drawings"], (old = []) =>
        old.filter((d) => d.id !== variables.data),
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

  const createDrawingMutation = useMutation({
    mutationFn: createDrawing,
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
  })

  const deleteFolderMutation = useMutation({
    mutationFn: deleteFolder,
    onMutate: () => {
      toast.loading("Deleting folder...", { id: "delete-folder" })
    },
    onSuccess: () => {
      toast.success("Folder deleted", { id: "delete-folder" })
      queryClient.invalidateQueries({ queryKey: ["folders"] })
      queryClient.invalidateQueries({ queryKey: ["drawings"] })
    },
    onError: () => {
      toast.error("Failed to delete folder", { id: "delete-folder" })
    },
  })

  // --- Drag & drop helpers ---
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

  // --- Delete handlers ---
  const onDeleteDrawing = (id: string) => {
    setConfirmDialog({
      title: "Delete drawing?",
      description: "Are you sure you want to delete this drawing?",
      onConfirm: async () => {
        await deleteDrawingMutation.mutateAsync({ data: id })

        if (id === currentDrawingId) {
          const remaining = drawings.filter((d) => d.id !== id)
          if (remaining.length > 0) {
            navigate({ to: "/draw/$id", params: { id: remaining[0].id } })
          } else {
            const newId = await createDrawingMutation.mutateAsync({
              data: {},
            })
            navigate({ to: "/draw/$id", params: { id: newId } })
          }
        }
      },
    })
  }

  const onDeleteFolder = (id: string, hasChildren: boolean) => {
    setConfirmDialog({
      title: "Delete folder?",
      description: hasChildren
        ? "This folder contains items. All files in this folder will be deleted."
        : "Delete this folder?",
      onConfirm: () => {
        deleteFolderMutation.mutate({ data: id })
      },
    })
  }

  // --- Dialog methods ---
  const showConfirmDialog = (dialog: NonNullable<ConfirmDialog>) => {
    setConfirmDialog(dialog)
  }

  const closeConfirmDialog = () => {
    setConfirmDialog(null)
  }

  return (
    <SidebarContext.Provider
      value={{
        tree,
        dropTarget,
        onDragStart,
        onDragEnd,
        onDragOver,
        onDragLeave,
        onDrop,
        onDeleteDrawing,
        onDeleteFolder,
        confirmDialog,
        showConfirmDialog,
        closeConfirmDialog,
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebarContext() {
  const context = useContext(SidebarContext)
  if (!context) {
    throw new Error(
      "useSidebarContext must be used within SidebarContextProvider",
    )
  }
  return context
}
