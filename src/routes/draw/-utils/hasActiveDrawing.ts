import type { TreeNode } from "../-components/sidebar"

export function hasActiveDrawing(nodes: TreeNode[], activeId: string): boolean {
  for (const node of nodes) {
    if (node.type === "drawing" && node.drawing.id === activeId) return true
    if (node.type === "folder" && hasActiveDrawing(node.children, activeId))
      return true
  }
  return false
}
