import type {
  Drawing,
  FolderType,
  TreeNode,
} from "../-components/SidebarContext"

export function buildFileTree(
  drawings: Drawing[],
  folders: FolderType[],
): TreeNode[] {
  const folderNodes = new Map<string, TreeNode & { type: "folder" }>()
  for (const folder of folders) {
    folderNodes.set(folder.id, { type: "folder", folder, children: [] })
  }

  const root: TreeNode[] = []

  for (const folder of folders) {
    const node = folderNodes.get(folder.id)
    if (!node) continue
    const parent = folder.parentId ? folderNodes.get(folder.parentId) : null
    if (parent) parent.children.push(node)
    else root.push(node)
  }

  for (const drawing of drawings) {
    const node: TreeNode = { type: "drawing", drawing }
    const parent = drawing.folderId ? folderNodes.get(drawing.folderId) : null
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
    for (const node of nodes) {
      if (node.type === "folder") sortNodes(node.children)
    }
  }
  sortNodes(root)

  return root
}

export function filterTree(drawings: Drawing[], query: string): TreeNode[] {
  const q = query.toLowerCase().trim()
  if (!q) return []

  return drawings
    .filter((drawing) => drawing.name.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((drawing) => ({ type: "drawing" as const, drawing }))
}
