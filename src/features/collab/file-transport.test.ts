import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { fetchRoomFile, uploadRoomFile } from "./file-transport"
import { roomPathForToken } from "./room-url"

const room = roomPathForToken("tok-123")
const file = {
  fileId: "file-123",
  dataUrl:
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

test("uploadRoomFile returns 'stored' on success", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 204 })),
  )
  expect(await uploadRoomFile(room, file)).toBe("stored")
})

test("uploadRoomFile returns 'too-large' on 413", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("Payload Too Large", { status: 413 })),
  )
  expect(await uploadRoomFile(room, file)).toBe("too-large")
})

test("uploadRoomFile returns 'rate-limited' on 429", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(new Response("Too Many Requests", { status: 429 })),
  )
  expect(await uploadRoomFile(room, file)).toBe("rate-limited")
})

test("uploadRoomFile returns 'invalid' on 400", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Bad Request", { status: 400 })),
  )
  expect(await uploadRoomFile(room, file)).toBe("invalid")
})

test("uploadRoomFile returns 'full' on 409", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Drawing full", { status: 409 })),
  )
  expect(await uploadRoomFile(room, file)).toBe("full")
})

test.each([401, 403, 500, 502, 503])(
  "uploadRoomFile returns 'failed' on non-verdict HTTP %i",
  async (status) => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("Error", { status })),
    )
    expect(await uploadRoomFile(room, file)).toBe("failed")
  },
)

test("uploadRoomFile returns 'failed' on network error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network connection lost")),
  )
  expect(await uploadRoomFile(room, file)).toBe("failed")
})

test("fetchRoomFile returns parsed binary file data on 200", async () => {
  const payload = {
    fileId: "file-123",
    mimeType: "image/png",
    dataUrl: file.dataUrl,
    created: 1234567890,
  }
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  )

  const result = await fetchRoomFile(room, "file-123")
  expect(result).toEqual({
    id: "file-123",
    mimeType: "image/png",
    dataURL: file.dataUrl,
    created: 1234567890,
  })
})

test("fetchRoomFile returns null on non-200", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response("Not Found", { status: 404 })),
  )
  expect(await fetchRoomFile(room, "file-123")).toBeNull()
})

test("fetchRoomFile returns null on malformed payload", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ bad: "data" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  )
  expect(await fetchRoomFile(room, "file-123")).toBeNull()
})

test("fetchRoomFile returns null on network error", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new Error("Network connection lost")),
  )
  expect(await fetchRoomFile(room, "file-123")).toBeNull()
})
