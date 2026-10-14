import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { afterEach, expect, test, vi } from "vitest"
import { drawingFiles } from "@/db/schema"
import type { SceneElement } from "./protocol"
import {
  FILE_GRACE_MS,
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

// No Room opens on an unreadable drawing: it would start empty, and writing
// that emptiness back is how an unreadable file becomes an empty one (spec §2.3).
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
  | { kind: "delete"; table: unknown; where: SQL }

function fakeDb(row: { data: string | null } | undefined) {
  const calls: SaveCall[] = []
  const tx = {
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
    delete: (table: unknown) => ({
      where: (where: SQL) => {
        calls.push({ kind: "delete", table, where })
        return Promise.resolve()
      },
    }),
  }
  const db = {
    transaction: (fn: (tx: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as Parameters<typeof saveRoomScene>[0]
  return { db, calls }
}

test("saveRoomScene writes the merged scene and bumps updatedAt", async () => {
  const { db, calls } = fakeDb({
    data: stored({ appState: { gridSize: 20 }, elements: [element("old", 1)] }),
  })

  await saveRoomScene(db, "drawing-1", [element("new", 5)])

  expect(calls.map((call) => call.kind)).toEqual(["select", "update", "delete"])
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
  expect(calls.map((call) => call.kind)).toEqual(["select", "update", "delete"])
})

// --- dropping unused images -----------------------------------------------

afterEach(() => {
  vi.useRealTimers()
})

const NOW = new Date("2026-10-13T12:00:00Z")
const HOUR = 60 * 60 * 1000

const image = (fileId: string, deleted?: { updated?: number }) => ({
  ...element(fileId, 1),
  type: "image",
  fileId,
  ...(deleted && { isDeleted: true, updated: deleted.updated }),
})

async function flushDelete(elements: SceneElement[]) {
  vi.useFakeTimers({ now: NOW })
  const { db, calls } = fakeDb({ data: stored({ elements: [] }) })
  await saveRoomScene(db, "drawing-1", elements)
  const remove = calls.find((call) => call.kind === "delete")
  if (remove?.kind !== "delete") throw new Error("no delete")
  expect(remove.table).toBe(drawingFiles)
  return new PgDialect().sqlToQuery(remove.where)
}

test("a flush drops this drawing's old image rows that no image uses", async () => {
  const { sql, params } = await flushDelete([
    image("live"),
    image("just-deleted", { updated: NOW.getTime() - HOUR }),
    image("deleted-long-ago", { updated: NOW.getTime() - 25 * HOUR }),
    image("unstamped-tombstone", {}),
  ])

  expect(sql).toContain(`"drawing_files"."drawingId" =`)
  expect(sql).toContain(`"drawing_files"."fileId" not in`)
  expect(params).toContain("drawing-1")
  // An undo brings a recently deleted image back with no re-upload.
  expect(params).toEqual(expect.arrayContaining(["live", "just-deleted"]))
  expect(params).not.toContain("deleted-long-ago")
  expect(params).not.toContain("unstamped-tombstone")
})

// A guest's upload can land before the scene update that references it.
test("rows newer than the grace period are kept even when no image uses them", async () => {
  const { sql, params } = await flushDelete([])

  expect(sql).toContain(`"drawing_files"."createdAt" <`)
  expect(params).toContain(
    new Date(NOW.getTime() - FILE_GRACE_MS).toISOString(),
  )
  // No image left: every old row goes.
  expect(sql).not.toContain("not in")
})
