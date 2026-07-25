import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import {
  mergeSceneElements,
  parseStoredScene,
  saveRoomScene,
} from "./scene-store"

const stored = (scene: unknown) => JSON.stringify(scene)

const elementsFrom = (data: string | null | undefined) =>
  parseStoredScene(data).elements

test("the elements are lifted out of a serialized scene", () => {
  const data = stored({
    type: "excalidraw",
    version: 2,
    appState: { viewBackgroundColor: "#fff" },
    elements: [{ id: "rect", version: 4, versionNonce: 7, index: "a0" }],
  })

  expect(elementsFrom(data)).toEqual([
    { id: "rect", version: 4, versionNonce: 7, index: "a0" },
  ])
})

test("an element without version fields is defaulted, the way restore() does it", () => {
  const data = stored({ elements: [{ id: "rect", type: "rectangle", x: 3 }] })

  expect(elementsFrom(data)).toEqual([
    { id: "rect", type: "rectangle", x: 3, version: 1, versionNonce: 0 },
  ])
})

test("only entries with no usable id are skipped — the rest of the drawing survives", () => {
  const data = stored({
    elements: [
      { id: "rect", version: 1, versionNonce: 1 },
      { x: 1 },
      null,
      "no",
    ],
  })

  expect(elementsFrom(data)).toEqual([
    { id: "rect", version: 1, versionNonce: 1 },
  ])
})

test("a blank or elementless drawing opens as an empty scene, and stays writable", () => {
  for (const data of [undefined, "", "{}", stored({ elements: "nope" })]) {
    expect(parseStoredScene(data)).toEqual({ elements: [], readable: true })
  }
})

// The Room checks `readable` before it flushes: a drawing whose JSON cannot be
// read opens as an empty canvas, and writing that emptiness back is how an
// unreadable file becomes an empty one (spec §2.3).
test("a drawing whose JSON cannot be read opens empty and is marked unreadable", () => {
  for (const data of ["not json at all", stored(null), stored([1, 2])]) {
    expect(parseStoredScene(data)).toEqual({ elements: [], readable: false })
  }
})

// --- flushing back (spec §2.3) ------------------------------------------

const element = (id: string, version: number) => ({
  id,
  version,
  versionNonce: 1,
})

test("a flush replaces the elements and leaves the rest of the stored scene alone", () => {
  const data = stored({
    type: "excalidraw",
    version: 2,
    source: "https://excalidraw.com",
    appState: { viewBackgroundColor: "#fff", gridSize: 20 },
    elements: [element("old", 1)],
  })

  const merged = JSON.parse(mergeSceneElements(data, [element("new", 9)]))

  // appState is whatever the last solo save wrote — mid-session scene tweaks
  // neither sync nor persist (spec §2.3).
  expect(merged.appState).toEqual({ viewBackgroundColor: "#fff", gridSize: 20 })
  expect(merged.type).toBe("excalidraw")
  expect(merged.source).toBe("https://excalidraw.com")
  expect(merged.elements).toEqual([element("new", 9)])
})

test("a blank or corrupt stored scene is replaced rather than preserved", () => {
  const elements = [element("rect", 2)]
  for (const data of [null, "", "not json at all", stored([1, 2, 3])]) {
    expect(JSON.parse(mergeSceneElements(data, elements))).toEqual({ elements })
  }
})

type SaveCall =
  | { kind: "select"; where: SQL }
  | { kind: "update"; set: Record<string, unknown>; where: SQL }

function fakeDb(row: { data: string | null } | undefined) {
  const calls: SaveCall[] = []
  const db = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          calls.push({ kind: "select", where })
          return Promise.resolve(row ? [row] : [])
        },
      }),
    }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => {
          calls.push({ kind: "update", set, where })
          return Promise.resolve()
        },
      }),
    }),
  } as unknown as Parameters<typeof saveRoomScene>[0]
  return { db, calls }
}

test("saveRoomScene writes the merged scene and bumps updatedAt", async () => {
  const { db, calls } = fakeDb({
    data: stored({ appState: { gridSize: 20 }, elements: [element("old", 1)] }),
  })

  await saveRoomScene(db, "drawing-1", [element("new", 5)])

  expect(calls.map((call) => call.kind)).toEqual(["select", "update"])
  const update = calls[1] as Extract<SaveCall, { kind: "update" }>
  expect(JSON.parse(update.set.data as string)).toEqual({
    appState: { gridSize: 20 },
    elements: [element("new", 5)],
  })
  // A collaborative edit is an edit: the drawing has to surface as Recent.
  expect(update.set.updatedAt).toBeInstanceOf(Date)
  expect(new PgDialect().sqlToQuery(update.where).sql).toContain(
    `"drawings"."id" =`,
  )
})

test("saveRoomScene writes nothing when the drawing is gone", async () => {
  const { db, calls } = fakeDb(undefined)

  await saveRoomScene(db, "drawing-1", [element("rect", 1)])

  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("saveRoomScene is not blocked by the trash — a trashed drawing keeps the work", async () => {
  const { db, calls } = fakeDb({ data: stored({ elements: [] }) })

  await saveRoomScene(db, "drawing-1", [element("rect", 1)])

  // §5.1: trashing mid-session ends with a final flush so guest work up to
  // that moment comes back with the drawing on restore.
  const select = calls[0] as Extract<SaveCall, { kind: "select" }>
  expect(new PgDialect().sqlToQuery(select.where).sql).not.toContain(
    "deletedAt",
  )
  expect(calls.map((call) => call.kind)).toEqual(["select", "update"])
})
