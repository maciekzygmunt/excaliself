// @vitest-environment node
import { verifyPassword } from "better-auth/crypto"
import { eq } from "drizzle-orm"
import { beforeAll, expect, test, vi } from "vitest"
import { demoAdmin, demoDrawings } from "@/db/demo-content"
import type { Db } from "@/db/index"
import { createPreviewDb } from "@/db/preview"
import { accounts, drawings, shares, stars, users } from "@/db/schema"
import { listDrawings } from "@/features/drawings/list"
import {
  MAX_SCENE_BYTES,
  writeDrawingScene,
} from "@/features/drawings/scene-write"
import { createShareLink } from "@/features/shares/store"
import { moveToTeam } from "@/features/spaces/move-to-team"
import { DEMO_LIMITS, demoRefusals } from "./policy"
import { checkDemoQuota } from "./quota"
import { createDemoVisitor, deleteExpiredVisitors } from "./visitors"

vi.mock("@/lib/mode", () => ({ instanceMode: "demo" }))
vi.mock("@/env", () => ({ env: { DEMO_RETENTION_HOURS: 6 } }))

let db: Db
beforeAll(async () => {
  db = await createPreviewDb()
}, 30_000)

const drawingsOf = async (userId: string) => listDrawings(db, userId)

/** The check constraint that refused a write. */
const refusedBy = (write: Promise<unknown>) =>
  write.then(
    () => null,
    (error: Error) => (error.cause as { constraint?: string }).constraint,
  )

test("nobody can sign in as the demo's admin", async () => {
  const [admin] = await db
    .select({ hash: accounts.password })
    .from(users)
    .innerJoin(accounts, eq(accounts.userId, users.id))
    .where(eq(users.id, demoAdmin.id))
  expect(
    await verifyPassword({
      hash: admin.hash ?? "",
      password: demoAdmin.password,
    }),
  ).toBe(false)
  expect(await drawingsOf(demoAdmin.id)).toEqual([])
})

test("each visitor gets a private copy that no other visitor sees", async () => {
  const ada = await createDemoVisitor(db)
  const bob = await createDemoVisitor(db)
  const [adaDrawings, bobDrawings] = await Promise.all([
    drawingsOf(ada.id),
    drawingsOf(bob.id),
  ])

  expect(adaDrawings.map((d) => d.name).sort()).toEqual(
    demoDrawings.map((d) => d.name).sort(),
  )
  expect(adaDrawings.every((d) => d.space === "private")).toBe(true)
  const adaIds = new Set(adaDrawings.map((d) => d.id))
  expect(bobDrawings.some((d) => adaIds.has(d.id))).toBe(false)
})

test("the database refuses Team and anyone links", async () => {
  const visitor = await createDemoVisitor(db)
  const [drawing] = await drawingsOf(visitor.id)

  expect(
    await refusedBy(
      moveToTeam(db, visitor.id, { type: "drawing", id: drawing.id }, null),
    ),
  ).toBe("demo_no_team")
  expect(
    await refusedBy(createShareLink(db, visitor.id, drawing.id, "anyone")),
  ).toBe("demo_members_only")
  await expect(
    createShareLink(db, visitor.id, drawing.id, "members"),
  ).resolves.toMatchObject({ audience: "members" })
})

test("a visitor can't make more drawings than the cap", async () => {
  const visitor = await createDemoVisitor(db)
  await expect(checkDemoQuota(db, "drawings", visitor.id)).resolves.toBe(
    undefined,
  )
  const room = DEMO_LIMITS.perAccount.drawings - demoDrawings.length
  await db.insert(drawings).values(
    Array.from({ length: room }, (_, i) => ({
      id: `${visitor.id}-extra-${i}`,
      name: "Extra",
      createdBy: visitor.id,
    })),
  )
  await expect(checkDemoQuota(db, "drawings", visitor.id)).rejects.toThrow(
    demoRefusals.drawings,
  )
})

test("cleanup deletes old visitors with all they made, and keeps the rest", async () => {
  const old = await createDemoVisitor(db)
  const recent = await createDemoVisitor(db)
  const [oldDrawing] = await drawingsOf(old.id)
  await createShareLink(db, old.id, oldDrawing.id, "members")
  await db.insert(stars).values({ userId: recent.id, drawingId: oldDrawing.id })
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)
  await db
    .update(users)
    .set({ createdAt: twoDaysAgo })
    .where(eq(users.id, old.id))

  const cutoff = new Date(Date.now() - 60 * 60 * 1000)
  expect(await deleteExpiredVisitors(db, cutoff)).toBe(1)

  expect(await db.select().from(users).where(eq(users.id, old.id))).toEqual([])
  expect(
    await db.select().from(drawings).where(eq(drawings.createdBy, old.id)),
  ).toEqual([])
  expect(
    await db.select().from(shares).where(eq(shares.drawingId, oldDrawing.id)),
  ).toEqual([])
  expect(await drawingsOf(recent.id)).toHaveLength(demoDrawings.length)
  expect(
    await db.select().from(users).where(eq(users.id, demoAdmin.id)),
  ).toHaveLength(1)
})

test("a solo save past the scene cap is refused", async () => {
  const visitor = await createDemoVisitor(db)
  const [drawing] = await drawingsOf(visitor.id)
  const data = JSON.stringify({
    elements: [],
    padding: "x".repeat(DEMO_LIMITS.sceneBytes),
  })

  expect(MAX_SCENE_BYTES).toBe(DEMO_LIMITS.sceneBytes)
  await expect(
    writeDrawingScene(db, visitor.id, { id: drawing.id, data, files: [] }),
  ).rejects.toThrow(demoRefusals.scene)
})
