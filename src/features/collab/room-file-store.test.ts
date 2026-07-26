import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { loadRoomFile, saveRoomFile } from "./room-file-store"

type Call =
  | { kind: "select"; where: SQL }
  | { kind: "insert"; values: Record<string, unknown> }

/** Renders a captured drizzle condition, so room scoping is assertable. */
const toSql = (where: SQL) => new PgDialect().sqlToQuery(where).sql

const FILE = {
  fileId: "file-1",
  mimeType: "image/png",
  dataUrl: "data:image/png;base64,QUJDRA==",
}

function fakeDb(rows: unknown[] = []) {
  const calls: Call[] = []
  const db = {
    select: () => ({
      from: () => ({
        where: (where: SQL) => {
          calls.push({ kind: "select", where })
          return Promise.resolve(rows)
        },
      }),
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => {
        calls.push({ kind: "insert", values })
        return Promise.resolve()
      },
    }),
  }
  return { db: db as never, calls }
}

test("writes the row, stamped with the id the uploader named", async () => {
  const { db, calls } = fakeDb()

  await saveRoomFile(db, "drawing-1", FILE, new Date("2026-07-25T10:00:00Z"))

  const insert = calls.find((call) => call.kind === "insert")
  expect(insert?.values).toMatchObject({
    drawingId: "drawing-1",
    fileId: "file-1",
    mimeType: "image/png",
    dataUrl: FILE.dataUrl,
    createdAt: new Date("2026-07-25T10:00:00Z"),
  })
})

test("an id the drawing already holds is left alone", async () => {
  // `fileId` is a content hash upstream, so a re-upload is the same bytes —
  // and every visitor re-offering the scene's images must be free.
  const { db, calls } = fakeDb([{ fileId: "file-1" }])

  await saveRoomFile(db, "drawing-1", FILE)

  expect(calls.some((call) => call.kind === "insert")).toBe(false)
})

test("the existence check is scoped to the drawing and the file", async () => {
  const { db, calls } = fakeDb()

  await saveRoomFile(db, "drawing-1", FILE)

  const select = calls.find((call) => call.kind === "select")
  expect(toSql(select?.where as SQL)).toContain(`"drawingId"`)
  expect(toSql(select?.where as SQL)).toContain(`"fileId"`)
})

test("a read is scoped to the room, so one token can't read another's images", async () => {
  const { db, calls } = fakeDb([
    { ...FILE, createdAt: new Date("2026-07-25T10:00:00Z") },
  ])

  const file = await loadRoomFile(db, "drawing-1", "file-1")

  const select = calls.find((call) => call.kind === "select")
  expect(toSql(select?.where as SQL)).toContain(`"drawingId"`)
  expect(file).toEqual({ ...FILE, created: Date.parse("2026-07-25T10:00:00Z") })
})

test("a fileId this drawing doesn't have reads as a miss", async () => {
  const { db } = fakeDb([])

  await expect(loadRoomFile(db, "drawing-1", "file-9")).resolves.toBeNull()
})
