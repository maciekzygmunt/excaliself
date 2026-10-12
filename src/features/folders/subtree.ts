// Shared between the server trash handler and the client's optimistic cache
// prune so both agree on what "the folder's subtree" means.

type FolderRef = { id: string; parentId: string | null }

type TrashableFolderRef = FolderRef & { deletedAt: Date | null }

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

/**
 * Restore targeting (spec §5.11): walks up from `startId` through parentId
 * links and returns the first folder that is not trashed — the folder itself
 * when it is live. Returns null (root) when the chain dead-ends in missing
 * rows, is trashed all the way up, or cycles. Restore never resurrects a
 * trashed parent chain, so this is the only legal landing spot.
 */
export function findNearestLiveAncestorId(
  folders: TrashableFolderRef[],
  startId: string,
): string | null {
  const byId = new Map(folders.map((folder) => [folder.id, folder]))
  const seen = new Set<string>()
  let currentId: string | null = startId
  while (currentId && !seen.has(currentId)) {
    seen.add(currentId)
    const folder = byId.get(currentId)
    if (!folder) return null
    if (folder.deletedAt === null) return folder.id
    currentId = folder.parentId
  }
  return null
}

/**
 * Whether `targetId` is a legal landing folder for the owner's live folders:
 * it must exist in `liveFolders`, and when moving a folder (`movingId`) it
 * must not be that folder or one of its descendants — a cycle would make the
 * subtree unreachable from root and loop every ancestor walk.
 */
export function isValidFolderTarget(
  liveFolders: FolderRef[],
  targetId: string,
  movingId?: string,
): boolean {
  if (!liveFolders.some((folder) => folder.id === targetId)) return false
  if (movingId === undefined) return true
  return !collectFolderSubtreeIds(liveFolders, movingId).has(targetId)
}
