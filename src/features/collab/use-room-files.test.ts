import { renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, expect, test, vi } from "vitest"
import * as fileTransport from "./file-transport"
import type { SceneElement } from "./protocol"
import { roomPathForToken } from "./room-url"
import { useRoomFiles } from "./use-room-files"

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  newElementWith: (element: object, updates: object) => ({
    ...element,
    ...updates,
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

const image = { id: "e1", type: "image", fileId: "f1", status: "pending" }
const elements = [image] as unknown as readonly SceneElement[]
const files = {
  f1: { id: "f1", mimeType: "image/png", dataURL: "data:,", created: 1 },
} as never

/** Uploads `f1` `times` times; returns the image's last status and toasts. */
async function upload(times: number) {
  const scene: unknown[] = [image]
  const api = {
    getSceneElementsIncludingDeleted: () => scene,
    updateScene: ({ elements }: { elements: unknown[] }) =>
      scene.splice(0, scene.length, ...elements),
  }
  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )
  for (let i = 0; i < times; i++) {
    result.current.uploadPending(elements, files)
    await result.current.flushUploads()
  }
  return {
    status: (scene[0] as { status: string }).status,
    toasts: vi.mocked(toast.error).mock.calls.map(([, options]) => options?.id),
  }
}

test.each([
  ["too-large", "image-too-large"],
  ["rate-limited", "image-rate-limited"],
  ["invalid", "image-invalid"],
  ["full", "image-cap-full"],
] as const)(
  "a %s refusal marks the image broken and says why",
  async (outcome, id) => {
    vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue(outcome)
    expect(await upload(1)).toEqual({ status: "error", toasts: [id] })
  },
)

test("a failed upload retries quietly, then says so on the last attempt", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("failed")
  expect(await upload(2)).toEqual({ status: "pending", toasts: [] })
  expect(await upload(3)).toEqual({
    status: "error",
    toasts: ["image-upload-failed"],
  })
})
