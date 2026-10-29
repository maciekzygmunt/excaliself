// @vitest-environment node
import { afterEach, expect, test, vi } from "vitest"
import { excalidrawPlusApi } from "./api"

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), init)

test("walks every page and waits out a 429", async () => {
  const requested: string[] = []
  let rateLimited = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      expect(new Headers(init.headers).get("Authorization")).toBe(
        "Bearer uk-key",
      )
      requested.push(`${url.pathname}${url.search}`)
      if (!rateLimited) {
        rateLimited = true
        return json({}, { status: 429, headers: { "Retry-After": "0" } })
      }
      const offset = Number(url.searchParams.get("offset"))
      return json({
        hasNextPage: offset === 0,
        data: [{ metadata: { id: `s${offset}`, name: "A", pinned: false } }],
      })
    }),
  )

  const scenes = await excalidrawPlusApi(
    "https://plus.test",
    "uk-key",
  ).scenesIn("private")

  expect(scenes.map((scene) => scene.id)).toEqual(["s0", "s1"])
  expect(requested).toEqual([
    "/api/v1/collections/private/scenes?limit=100&offset=0",
    "/api/v1/collections/private/scenes?limit=100&offset=0",
    "/api/v1/collections/private/scenes?limit=100&offset=1",
  ])
})

test("after a 429, waits until the rate limit resets", async () => {
  vi.useFakeTimers({ now: new Date("2026-01-01T00:00:00Z") })
  const reset = String(Date.now() / 1000 + 30)
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      json({}, { status: 429, headers: { "X-RateLimit-Reset": reset } }),
    )
    .mockResolvedValueOnce(json({ data: [], hasNextPage: false }))
  vi.stubGlobal("fetch", fetch)

  const collections = excalidrawPlusApi(
    "https://plus.test",
    "uk-key",
  ).collections()
  await vi.advanceTimersByTimeAsync(29_000)
  expect(fetch).toHaveBeenCalledTimes(1)
  await vi.advanceTimersByTimeAsync(3_000)
  await expect(collections).resolves.toEqual([])
  expect(fetch).toHaveBeenCalledTimes(2)
})

test("reports a rejected key in plain words", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => json({ message: "Unauthorized" }, { status: 401 })),
  )
  await expect(
    excalidrawPlusApi("https://plus.test", "bad").collections(),
  ).rejects.toThrow("Excalidraw+ didn't accept this key")
})
