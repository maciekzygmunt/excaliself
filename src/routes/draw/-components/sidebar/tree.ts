import type { getDrawings } from "@/server/drawings"
import type { getFolders } from "@/server/folders"

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

const compareNodes = (a: TreeNode, b: TreeNode) => {
  if (a.type !== b.type) return a.type === "folder" ? -1 : 1
  const nameA = a.type === "folder" ? a.folder.name : a.drawing.name
  const nameB = b.type === "folder" ? b.folder.name : b.drawing.name
  return nameA.localeCompare(nameB)
}

export function buildTree(
  folders: FolderType[],
  drawings: Drawing[],
): TreeNode[] {
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

/** Search drawings only — folders aren't navigable destinations. */
export function filterTreeBySearch(
  drawings: Drawing[],
  query: string,
): TreeNode[] {
  const q = query.toLowerCase().trim()
  if (!q) return []
  return drawings
    .filter((d) => d.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((d) => ({ type: "drawing" as const, drawing: d }))
}

export function isDescendantFolder(
  folderId: string,
  candidateAncestorId: string | null,
  foldersById: Map<string, FolderType>,
): boolean {
  let id = candidateAncestorId
  while (id) {
    if (id === folderId) return true
    id = foldersById.get(id)?.parentId ?? null
  }
  return false
}
