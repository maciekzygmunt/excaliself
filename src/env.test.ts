// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from "vitest"

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", "postgres://user:pass@127.0.0.1:5432/db")
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-test-secret-test-secret-00")
  // Vitest sets BASE_URL to "/", which is not a URL.
  vi.stubEnv("BASE_URL", "http://127.0.0.1:3000")
  vi.stubEnv("MCP_STDIO", "true")
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
})

// stdio has no sign-in, so it must never reach a real database.
test("MCP_STDIO refuses to start without preview mode", async () => {
  vi.stubEnv("PREVIEW_MODE", "")
  const errors = vi.spyOn(console, "error").mockImplementation(() => {})
  await expect(import("./env")).rejects.toThrow("Invalid environment variables")
  expect(errors.mock.calls[0]?.[1]).toEqual([
    expect.objectContaining({
      path: ["MCP_STDIO"],
      message: "MCP_STDIO=true needs PREVIEW_MODE=true",
    }),
  ])
})

test("MCP_STDIO starts in preview mode", async () => {
  vi.stubEnv("PREVIEW_MODE", "true")
  const { env } = await import("./env")
  expect(env.MCP_STDIO).toBe(true)
})

test("TRUSTED_ORIGINS keeps only the origin of each entry", async () => {
  vi.stubEnv("PREVIEW_MODE", "true")
  vi.stubEnv(
    "TRUSTED_ORIGINS",
    "http://192.168.1.20:3000/, HTTP://Umbrel.local:3000/draw",
  )
  const { env } = await import("./env")
  expect(env.TRUSTED_ORIGINS).toEqual([
    "http://192.168.1.20:3000",
    "http://umbrel.local:3000",
  ])
})

test("TRUSTED_ORIGINS refuses a value that is not an http(s) URL", async () => {
  vi.stubEnv("PREVIEW_MODE", "true")
  vi.stubEnv("TRUSTED_ORIGINS", "192.168.1.20:3000")
  vi.spyOn(console, "error").mockImplementation(() => {})
  await expect(import("./env")).rejects.toThrow("Invalid environment variables")
})

test("image limit env vars default to 2 MB, 20 MB, and 30 per minute", async () => {
  vi.stubEnv("PREVIEW_MODE", "true")
  const { env } = await import("./env")
  expect(env.MAX_IMAGE_MB).toBe(2)
  expect(env.MAX_DRAWING_IMAGE_MB).toBe(20)
  expect(env.IMAGE_UPLOADS_PER_MINUTE).toBe(30)
})

test("image limit env vars accept custom positive values", async () => {
  vi.stubEnv("PREVIEW_MODE", "true")
  vi.stubEnv("MAX_IMAGE_MB", "4.5")
  vi.stubEnv("MAX_DRAWING_IMAGE_MB", "50")
  vi.stubEnv("IMAGE_UPLOADS_PER_MINUTE", "60")
  const { env } = await import("./env")
  expect(env.MAX_IMAGE_MB).toBe(4.5)
  expect(env.MAX_DRAWING_IMAGE_MB).toBe(50)
  expect(env.IMAGE_UPLOADS_PER_MINUTE).toBe(60)
})

test.each([
  ["MAX_IMAGE_MB", "0"],
  ["MAX_IMAGE_MB", "-1"],
  ["MAX_IMAGE_MB", "not-a-number"],
  ["MAX_DRAWING_IMAGE_MB", "0"],
  ["MAX_DRAWING_IMAGE_MB", "-5"],
  ["IMAGE_UPLOADS_PER_MINUTE", "0"],
  ["IMAGE_UPLOADS_PER_MINUTE", "-10"],
  ["IMAGE_UPLOADS_PER_MINUTE", "3.5"],
])("refuses invalid %s=%s", async (key, value) => {
  vi.stubEnv("PREVIEW_MODE", "true")
  vi.stubEnv(key, value)
  vi.spyOn(console, "error").mockImplementation(() => {})
  await expect(import("./env")).rejects.toThrow("Invalid environment variables")
})
