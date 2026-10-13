import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawingFiles, drawings } from "@/db/schema"
import { writeDrawingScene } from "./scene-write"

type Call =
  | { kind: "select"; table: unknown; where: SQL }
  | { kind: "update"; table: unknown; set: Record<string, unknown>; where: SQL }
  | { kind: "insert"; table: unknown; values: Record<string, unknown>[] }
  | { kind: "delete"; table: unknown; where: SQL }

const toSql = (where: SQL) => new PgDialect().sqlToQuery(where).sql
const toParams = (where: SQL) => new PgDialect().sqlToQuery(where).params

const SCENE = '{"elements":[]}'

function fakeDb(options: {
  /** What the ownership + share lookup resolves to; none means "not found". */
  target?: { id: string; shareId: string | null }
  /** Rows already in drawing_files for this drawing. */
  storedFileIds?: string[]
  /** When false, the guarded UPDATE matches nothing — a share landed first. */
  updateHits?: boolean
}) {
  const calls: Call[] = []
  const tx = {
    select: () => ({
      from: (table: unknown) => {
        const chain = {
          leftJoin: () => chain,
          where: (where: SQL) => {
            calls.push({ kind: "select", table, where })
            if (table === drawingFiles)
              return Promise.resolve(
                (options.storedFileIds ?? []).map((fileId) => ({ fileId })),
              )
            return Promise.resolve(options.target ? [options.target] : [])
          },
        }
        return chain
      },
    }),
    update: (table: unknown) => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: SQL) => ({
          returning: () => {
            calls.push({ kind: "update", table, set, where })
            return Promise.resolve(
              options.updateHits === false ? [] : [{ id: "d1" }],
            )
          },
        }),
      }),
    }),
    insert: (table: unknown) => ({
      values: (values: Record<string, unknown>[]) => {
        calls.push({ kind: "insert", table, values })
        return Promise.resolve()
      },
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
  } as unknown as Parameters<typeof writeDrawingScene>[0]
  return { db, calls }
}

const file = (fileId: string) => ({
  fileId,
  dataUrl: "data:image/png;base64,QUJDRA==",
})

test("a solo save writes the scene, its search text, and bumps updatedAt", async () => {
  const { db, calls } = fakeDb({ target: { id: "d1", shareId: null } })
  const scene = JSON.stringify({ elements: [{ type: "text", text: "Login" }] })

  const result = await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: scene,
    files: [],
  })

  expect(result).toEqual({ status: "saved", missingFileIds: [] })
  const update = calls.find((call) => call.kind === "update")
  expect(update?.set.data).toBe(scene)
  expect(update?.set.searchText).toBe("Login")
  expect(update?.set.updatedAt).toBeInstanceOf(Date)
})

test("the gate is one statement: owner, not trashed, and whether it is shared", async () => {
  const { db, calls } = fakeDb({ target: { id: "d1", shareId: null } })

  await writeDrawingScene(db, "user-1", { id: "d1", data: SCENE, files: [] })

  const gate = calls[0] as Extract<Call, { kind: "select" }>
  expect(gate.table).toBe(drawings)
  const sql = toSql(gate.where)
  expect(sql).toContain(`"drawings"."ownerId" =`)
  expect(sql).toContain(`"drawings"."deletedAt" is null`)
})

test("a shared drawing refuses the write — the room owns its data", async () => {
  const { db, calls } = fakeDb({ target: { id: "d1", shareId: "share-1" } })

  const result = await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: SCENE,
    files: [file("f1")],
  })

  // Spec §5.5: while a shares row exists the socket path is the only writer,
  // so a stale tab's autosave must not land at all — not even its files.
  expect(result).toEqual({ status: "shared" })
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

test("a drawing the caller doesn't own is not found, and nothing is written", async () => {
  const { db, calls } = fakeDb({})

  await expect(
    writeDrawingScene(db, "user-1", { id: "d1", data: SCENE, files: [] }),
  ).rejects.toThrow("Drawing not found")
  expect(calls.map((call) => call.kind)).toEqual(["select"])
})

const image = (fileId: string, isDeleted = false) => ({
  type: "image",
  fileId,
  isDeleted,
})

test("files reconcile: new ones are inserted, unused ones dropped", async () => {
  const { db, calls } = fakeDb({
    target: { id: "d1", shareId: null },
    storedFileIds: ["keep", "drop", "erased"],
  })

  await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: JSON.stringify({
      elements: [image("keep"), image("add"), image("erased", true)],
    }),
    files: [file("keep"), file("add")],
  })

  const removed = calls.find((call) => call.kind === "delete")
  expect(removed?.table).toBe(drawingFiles)
  expect(toParams(removed?.where as SQL)).toEqual(["d1", "drop", "erased"])
  const inserted = calls.find((call) => call.kind === "insert")
  expect(inserted?.values).toEqual([
    expect.objectContaining({
      fileId: "add",
      mimeType: "image/png",
      bytes: Buffer.from("ABCD"),
    }),
  ])
})

// The client sends only images it believes unstored, so it has to hear about
// one the server lost, and one that failed the upload checks is not stored.
test("a used image with no stored bytes is reported missing", async () => {
  const { db, calls } = fakeDb({ target: { id: "d1", shareId: null } })

  const result = await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: JSON.stringify({ elements: [image("lost"), image("bad")] }),
    files: [{ fileId: "bad", dataUrl: "data:text/html;base64,QUJDRA==" }],
  })

  expect(result).toEqual({ status: "saved", missingFileIds: ["lost", "bad"] })
  expect(calls.some((call) => call.kind === "insert")).toBe(false)
})

// Regression: a tab that had not fetched a guest's upload yet sent no bytes
// for it, and its first solo save after a share deleted the stored row.
test("a stored file the scene still uses is kept, even if the payload lacks it", async () => {
  const { db, calls } = fakeDb({
    target: { id: "d1", shareId: null },
    storedFileIds: ["uploaded-by-guest"],
  })

  await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: JSON.stringify({ elements: [image("uploaded-by-guest")] }),
    files: [],
  })

  expect(calls.some((call) => call.kind === "delete")).toBe(false)
})

// Spec §5.5's single-writer invariant has to survive another tab of the
// owner's minting a link between the gate and the write.
test("a share created between the gate and the write still refuses the save", async () => {
  const { db, calls } = fakeDb({
    target: { id: "d1", shareId: null },
    updateHits: false,
  })

  const result = await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: SCENE,
    files: [file("f1")],
  })

  expect(result).toEqual({ status: "shared" })
  // The UPDATE carries the no-share condition itself, so it matched nothing —
  // and the files must not be reconciled behind a write that never landed.
  const update = calls.find((call) => call.kind === "update")
  expect(toSql(update?.where as SQL)).toContain("not exists")
  expect(calls.some((call) => call.kind === "insert")).toBe(false)
  expect(calls.some((call) => call.kind === "delete")).toBe(false)
})
