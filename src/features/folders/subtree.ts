// Shared between the server trash handler and the client's optimistic cache
// prune so both agree on what "the folder's subtree" means.

type FolderRef = { id: string; parentId: string | null }

/** Walks parentId to collect a folder and all its descendant folder ids. */
export function collectFolderSubtreeIds(
  folders: FolderRef[],
  rootId: string,
): Set<string> {
  const childrenByParent = new Map<string, string[]>()
  for (const folder of folders) {
    if (!folder.parentId) continue
    const list = childrenByParent.get(folder.parentId)
    if (list) list.push(folder.id)
    else childrenByParent.set(folder.parentId, [folder.id])
  }

  const subtree = new Set<string>([rootId])
  const stack = [rootId]
  while (stack.length > 0) {
    const id = stack.pop()
    if (!id) continue
    for (const childId of childrenByParent.get(id) ?? []) {
      if (subtree.has(childId)) continue
      subtree.add(childId)
      stack.push(childId)
    }
  }
  return subtree
}
