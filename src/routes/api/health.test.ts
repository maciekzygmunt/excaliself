import { expect, test, vi } from "vitest"
import { healthHandler } from "./health"

const execute = vi.hoisted(() => vi.fn())
vi.mock("@/db", () => ({ db: { execute } }))

test("returns 200 with a JSON body when the database answers", async () => {
  execute.mockResolvedValueOnce({ rows: [{ "?column?": 1 }] })

  const response = await healthHandler()

  expect(response.status).toBe(200)
  expect(response.headers.get("content-type")).toContain("application/json")
  await expect(response.json()).resolves.toEqual({ status: "ok" })
})

test("returns 503 when the database round-trip fails", async () => {
  execute.mockRejectedValueOnce(new Error("connection refused"))

  const response = await healthHandler()

  expect(response.status).toBe(503)
  await expect(response.json()).resolves.toEqual({ status: "unavailable" })
})
