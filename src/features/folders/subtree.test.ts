import { expect, test } from "vitest"
import { collectFolderSubtreeIds, findNearestLiveAncestorId } from "./subtree"

const folder = (id: string, parentId: string | null = null) => ({
  id,
  parentId,
})

const trashable = (
  id: string,
  parentId: string | null = null,
  deletedAt: Date | null = null,
) => ({ id, parentId, deletedAt })

const TRASHED = new Date("2026-07-01T00:00:00Z")

test("collects the root and all nested descendants", () => {
  const folders = [
    folder("a"),
    folder("b", "a"),
    folder("c", "b"),
    folder("d", "a"),
    folder("other"),
    folder("other-child", "other"),
  ]
  expect(collectFolderSubtreeIds(folders, "a")).toEqual(
    new Set(["a", "b", "c", "d"]),
  )
})

test("a leaf folder is just itself", () => {
  const folders = [folder("a"), folder("b", "a")]
  expect(collectFolderSubtreeIds(folders, "b")).toEqual(new Set(["b"]))
})

test("the root id is included even when unknown to the list", () => {
  expect(collectFolderSubtreeIds([], "ghost")).toEqual(new Set(["ghost"]))
})

test("a live folder is its own nearest live ancestor", () => {
  const folders = [trashable("a"), trashable("b", "a")]
  expect(findNearestLiveAncestorId(folders, "b")).toBe("b")
})

test("a trashed folder resolves to its first live ancestor", () => {
  const folders = [
    trashable("a"),
    trashable("b", "a", TRASHED),
    trashable("c", "b", TRASHED),
  ]
  expect(findNearestLiveAncestorId(folders, "c")).toBe("a")
})

test("a fully trashed chain lands at root", () => {
  const folders = [trashable("a", null, TRASHED), trashable("b", "a", TRASHED)]
  expect(findNearestLiveAncestorId(folders, "b")).toBeNull()
})

test("a missing folder lands at root — restore never invents parents", () => {
  expect(findNearestLiveAncestorId([], "ghost")).toBeNull()
})

test("a chain that dead-ends in a missing row lands at root", () => {
  const folders = [trashable("b", "gone", TRASHED)]
  expect(findNearestLiveAncestorId(folders, "b")).toBeNull()
})

test("a parentId cycle terminates at root instead of looping", () => {
  const folders = [trashable("a", "b", TRASHED), trashable("b", "a", TRASHED)]
  expect(findNearestLiveAncestorId(folders, "a")).toBeNull()
})
