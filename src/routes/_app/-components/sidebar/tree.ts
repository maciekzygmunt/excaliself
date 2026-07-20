import type { Drawing } from "@/features/drawings/queries"
import type { Folder } from "@/features/folders/queries"

export type { Drawing, Folder }

export type TreeNode =
  | { type: "folder"; folder: Folder; children: TreeNode[] }
  | { type: "drawing"; drawing: Drawing }

const compareNodes = (a: TreeNode, b: TreeNode) => {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1
  const nameA = a.type === "folder" ? a.folder.name : a.drawing.name
  const nameB = b.type === "folder" ? b.folder.name : b.drawing.name
  return nameA.localeCompare(nameB)
}

export function buildTree(folders: Folder[], drawings: Drawing[]): TreeNode[] {
  const nodesById = new Map<string, TreeNode & { type: "folder" }>()
  for (const folder of folders) {
    nodesById.set(folder.id, { type: "folder", folder, children: [] })
  }

  const root: TreeNode[] = []

  for (const folder of folders) {
    const node = nodesById.get(folder.id)
    if (!node) continue
    const parent = folder.parentId ? nodesById.get(folder.parentId) : null
    if (parent) parent.children.push(node)
    else root.push(node)
  }

  for (const drawing of drawings) {
    const node: TreeNode = { type: "drawing", drawing }
    const parent = drawing.folderId ? nodesById.get(drawing.folderId) : null
    if (parent) parent.children.push(node)
    else root.push(node)
  }

  const sortRecursive = (nodes: TreeNode[]) => {
    nodes.sort(compareNodes)
    for (const node of nodes) {
      if (node.type === "folder") sortRecursive(node.children)
    }
  }
  sortRecursive(root)

  return root
}

export function isDescendantFolder(
  folderId: string,
  candidateAncestorId: string | null,
  foldersById: Map<string, Folder>,
): boolean {
  let id = candidateAncestorId
  while (id) {
    if (id === folderId) return true
    id = foldersById.get(id)?.parentId ?? null
  }
  return false
}

export function treeNodeKey(node: TreeNode): string {
  return node.type === "folder" ? node.folder.id : node.drawing.id
}

export function hasActiveDrawing(
  nodes: TreeNode[],
  activeId: string | undefined,
): boolean {
  if (!activeId) return false
  for (const node of nodes) {
    if (node.type === "drawing" && node.drawing.id === activeId) return true
    if (node.type === "folder" && hasActiveDrawing(node.children, activeId))
      return true
  }
  return false
}
