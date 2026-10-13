import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { expect, test } from "vitest"
import { loadRoomFile, saveRoomFile } from "./room-file-store"
import { MAX_DRAWING_IMAGE_BYTES } from "./room-files"

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
/** FILE as drawing_files holds it: raw bytes, not base64. */
const ROW = {
  fileId: "file-1",
  mimeType: "image/png",
  bytes: Buffer.from("ABCD"),
}

/** `storedBytes` answers the size query; `rows` every other select. */
function fakeDb(rows: unknown[] = [], storedBytes = 0) {
  const calls: Call[] = []
  const db = {
    select: (fields: Record<string, unknown>) => ({
      from: () => ({
        where: (where: SQL) => {
          calls.push({ kind: "select", where })
          return Promise.resolve(
            "total" in fields ? [{ total: storedBytes }] : rows,
          )
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

test("writes the decoded bytes, stamped with the id the uploader named", async () => {
  const { db, calls } = fakeDb()

  await saveRoomFile(db, "drawing-1", FILE, new Date("2026-07-25T10:00:00Z"))

  const insert = calls.find((call) => call.kind === "insert")
  expect(insert?.values).toMatchObject({
    drawingId: "drawing-1",
    fileId: "file-1",
    mimeType: "image/png",
    bytes: ROW.bytes,
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

test("an image that would take the drawing over its cap is not stored", async () => {
  // FILE is 4 bytes: it fits exactly into the last 4, not into 3.
  const fits = fakeDb([], MAX_DRAWING_IMAGE_BYTES - 4)
  const over = fakeDb([], MAX_DRAWING_IMAGE_BYTES - 3)

  await expect(saveRoomFile(fits.db, "drawing-1", FILE)).resolves.toBe("stored")
  await expect(saveRoomFile(over.db, "drawing-1", FILE)).resolves.toBe("full")

  expect(over.calls.some((call) => call.kind === "insert")).toBe(false)
  const sizeQuery = over.calls.at(-1) as Extract<Call, { kind: "select" }>
  expect(toSql(sizeQuery.where)).toContain(`"drawingId"`)
})

test("a read is scoped to the room, so one token can't read another's images", async () => {
  const { db, calls } = fakeDb([
    { ...ROW, createdAt: new Date("2026-07-25T10:00:00Z") },
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
