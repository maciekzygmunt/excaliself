import type { LibraryItem, LibraryItems } from "@excalidraw/excalidraw/types"
import { expect, test, vi } from "vitest"
import { createLibrarySync, type LibraryChange } from "./sync"

const item = (id: string): LibraryItem => ({
  id,
  status: "unpublished",
  elements: [],
  created: 0,
})
const ids = (items: LibraryItems) => items.map(({ id }) => id)

/**
 * A sync wired to a fake panel: `show` lands at once and echoes through
 * `change`, as Excalidraw's `onLibraryChange` does. Saves wait for `answer`.
 */
function setup() {
  let panel: LibraryItems = []
  const saves: { change: LibraryChange; answer: (items: string[]) => void }[] =
    []
  const sync = createLibrarySync({
    save: (change) =>
      new Promise((resolve) => {
        saves.push({ change, answer: (next) => resolve(next.map(item)) })
      }),
    show: (items) => {
      panel = items
      sync.change(items)
    },
    onSaveError: vi.fn(),
  })
  // A member's edit in the panel.
  const edit = (next: string[]) => {
    panel = next.map(item)
    sync.change(panel)
  }
  const settle = () => new Promise((resolve) => setTimeout(resolve))
  return { sync, saves, edit, settle, panel: () => ids(panel) }
}

test("the first load fills the panel and saves nothing back", async () => {
  const { sync, saves, settle, panel } = setup()

  sync.receive([item("a"), item("b")])
  await settle()

  expect(panel()).toEqual(["a", "b"])
  expect(saves).toEqual([])
})

test("an edit saves only what it added and removed", async () => {
  const { sync, saves, edit, settle } = setup()
  sync.receive([item("a"), item("b")])

  edit(["new", "a"])
  await settle()
  expect(ids(saves[0].change.add)).toEqual(["new"])
  expect(saves[0].change.remove).toEqual(["b"])
  saves[0].answer(["new", "a"])
  await settle()
  expect(saves).toHaveLength(1)
})

test("a teammate's change waits for the save in flight, whose answer is newer", async () => {
  const { sync, saves, edit, settle, panel } = setup()
  sync.receive([item("a")])
  edit(["mine", "a"])
  await settle()

  // Fetched before the save landed, so it lacks "mine".
  sync.receive([item("theirs"), item("a")])
  expect(panel()).toEqual(["mine", "a"])

  saves[0].answer(["mine", "theirs", "a"])
  await settle()
  expect(panel()).toEqual(["mine", "theirs", "a"])
  // Showing it was not an edit.
  expect(saves).toHaveLength(1)
})

test("edits made during a save go up after it, as their own change", async () => {
  const { sync, saves, edit, settle } = setup()
  sync.receive([item("a")])
  edit(["b", "a"])
  edit(["c", "b", "a"])
  await settle()
  expect(saves).toHaveLength(1)

  saves[0].answer(["b", "a"])
  await settle()
  expect(saves).toHaveLength(2)
  expect(ids(saves[1].change.add)).toEqual(["c"])
})

test("a failed save puts the server's library back", async () => {
  const onSaveError = vi.fn()
  let panel: LibraryItems = []
  const sync = createLibrarySync({
    save: () => Promise.reject(new Error("offline")),
    show: (items) => {
      panel = items
      sync.change(items)
    },
    onSaveError,
  })
  sync.receive([item("a")])

  sync.change([item("b"), item("a")])
  await new Promise((resolve) => setTimeout(resolve))

  expect(onSaveError).toHaveBeenCalledOnce()
  expect(ids(panel)).toEqual(["a"])
})
