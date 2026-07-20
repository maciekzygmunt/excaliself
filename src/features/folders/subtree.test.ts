import { expect, test } from "vitest"
import { collectFolderSubtreeIds } from "./subtree"

const folder = (id: string, parentId: string | null = null) => ({
  id,
  parentId,
})

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
