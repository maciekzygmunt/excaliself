import { expect, test } from "vitest"
import type { Folder } from "@/features/folders/queries"
import { canDrop } from "./tree"

const folder = (id: string, parentId: string | null): Folder =>
  ({ id, parentId }) as Folder
// a ⊃ b
const foldersById = new Map([
  ["a", folder("a", null)],
  ["b", folder("b", "a")],
])

test("a private item can go anywhere in Private or Team", () => {
  const item = { type: "drawing", id: "d", space: "private" } as const
  expect(canDrop(item, { type: "root", space: "private" }, foldersById)).toBe(
    true,
  )
  expect(canDrop(item, { type: "root", space: "team" }, foldersById)).toBe(true)
  expect(
    canDrop(item, { type: "folder", id: "b", space: "team" }, foldersById),
  ).toBe(true)
})

test("a Team item never comes back to Private", () => {
  for (const type of ["drawing", "folder"] as const) {
    const item = { type, id: "x", space: "team" } as const
    expect(canDrop(item, { type: "root", space: "private" }, foldersById)).toBe(
      false,
    )
    expect(
      canDrop(item, { type: "folder", id: "a", space: "private" }, foldersById),
    ).toBe(false)
    expect(canDrop(item, { type: "root", space: "team" }, foldersById)).toBe(
      true,
    )
  }
})

test("a folder can't go into itself or its own subtree", () => {
  const item = { type: "folder", id: "a", space: "team" } as const
  const into = (id: string) =>
    canDrop(item, { type: "folder", id, space: "team" }, foldersById)
  expect(into("a")).toBe(false)
  expect(into("b")).toBe(false)
  // ...but b can leave a for the root
  expect(
    canDrop(
      { type: "folder", id: "b", space: "team" },
      { type: "root", space: "team" },
      foldersById,
    ),
  ).toBe(true)
})
