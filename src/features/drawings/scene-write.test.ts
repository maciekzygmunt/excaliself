import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { drawingFiles, drawings } from "@/db/schema"
import { writeDrawingScene } from "./scene-write"

type Call =
  | { kind: "select"; table: unknown; where: SQL }
  | { kind: "update"; table: unknown; set: Record<string, unknown> }
  | { kind: "insert"; table: unknown; values: Record<string, unknown>[] }
  | { kind: "delete"; table: unknown; where: SQL }

const toSql = (where: SQL) => new PgDialect().sqlToQuery(where).sql

const SCENE = '{"elements":[]}'

function fakeDb(options: {
  /** What the ownership + share lookup resolves to; none means "not found". */
  target?: { id: string; shareId: string | null }
  /** Rows already in drawing_files for this drawing. */
  storedFileIds?: string[]
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
        where: () => {
          calls.push({ kind: "update", table, set })
          return Promise.resolve()
        },
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
  mimeType: "image/png",
  dataUrl: `data:image/png;base64,${fileId}`,
})

test("a solo save writes the scene and bumps updatedAt", async () => {
  const { db, calls } = fakeDb({ target: { id: "d1", shareId: null } })

  const result = await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: SCENE,
    files: [],
  })

  expect(result).toEqual({ status: "saved" })
  const update = calls.find((call) => call.kind === "update")
  expect(update?.set.data).toBe(SCENE)
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

test("files still reconcile: new ones are inserted, unreferenced ones dropped", async () => {
  const { db, calls } = fakeDb({
    target: { id: "d1", shareId: null },
    storedFileIds: ["keep", "drop"],
  })

  await writeDrawingScene(db, "user-1", {
    id: "d1",
    data: SCENE,
    files: [file("keep"), file("add")],
  })

  const removed = calls.find((call) => call.kind === "delete")
  expect(removed?.table).toBe(drawingFiles)
  expect(toSql(removed?.where as SQL)).toContain(`"fileId" in`)
  const inserted = calls.find((call) => call.kind === "insert")
  expect(
    (inserted?.values as Record<string, unknown>[]).map((row) => row.fileId),
  ).toEqual(["add"])
})
