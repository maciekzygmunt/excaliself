import { afterEach, expect, test, vi } from "vitest"
import { uploadRoomFile } from "./file-transport"
import { roomPathForToken } from "./room-url"

const room = roomPathForToken("tok-123")
const file = { fileId: "file-123", dataUrl: "data:image/png;base64,AAAA" }

afterEach(() => {
  vi.unstubAllGlobals()
})

test.each([
  [204, "stored"],
  [400, "invalid"],
  [409, "full"],
  [413, "too-large"],
  [429, "rate-limited"],
  // No verdict on the image itself: retried.
  [401, "failed"],
  [500, "failed"],
])("an upload answered %i is %s", async (status, outcome) => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status })),
  )
  expect(await uploadRoomFile(room, file)).toBe(outcome)
})

test("a network error is a retryable failure", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")))
  expect(await uploadRoomFile(room, file)).toBe("failed")
})
