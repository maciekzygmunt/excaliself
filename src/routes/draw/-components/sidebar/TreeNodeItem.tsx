import { DrawingItem } from "./DrawingItem"
import { FolderItem } from "./FolderItem"
import type { TreeNode } from "./tree"

export function TreeNodeItem({ node }: { node: TreeNode }) {
  if (node.type === "folder") {
    return <FolderItem folder={node.folder} childNodes={node.children} />
  }
  return <DrawingItem drawing={node.drawing} />
}

export function treeNodeKey(node: TreeNode): string {
  return node.type === "folder" ? node.folder.id : node.drawing.id
}
