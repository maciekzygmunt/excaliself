import { renderHook } from "@testing-library/react"
import { toast } from "sonner"
import { beforeEach, expect, test, vi } from "vitest"
import * as fileTransport from "./file-transport"
import type { SceneElement } from "./protocol"
import { roomPathForToken } from "./room-url"
import {
  markImageStatus,
  toastImageCapFull,
  toastImageInvalid,
  toastImageRateLimited,
  toastImageTooLarge,
  toastImageUploadFailed,
  useRoomFiles,
} from "./use-room-files"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
  },
}))

vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "never" },
  newElementWith: (element: unknown, updates: unknown) => ({
    ...(element as object),
    ...(updates as object),
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
})

test("toastImageCapFull triggers toast with id 'image-cap-full'", () => {
  toastImageCapFull()
  expect(toast.error).toHaveBeenCalledWith(
    "This drawing can't hold more images",
    expect.objectContaining({
      id: "image-cap-full",
      description: expect.stringContaining("MB of images"),
    }),
  )
})

test("toastImageTooLarge triggers toast with id 'image-too-large'", () => {
  toastImageTooLarge()
  expect(toast.error).toHaveBeenCalledWith(
    "Image too large",
    expect.objectContaining({
      id: "image-too-large",
      description: "Image exceeds max allowed size.",
    }),
  )
})

test("toastImageRateLimited triggers toast with id 'image-rate-limited'", () => {
  toastImageRateLimited()
  expect(toast.error).toHaveBeenCalledWith(
    "Upload limit reached",
    expect.objectContaining({
      id: "image-rate-limited",
      description: "Too many image uploads, please wait a moment.",
    }),
  )
})

test("toastImageInvalid triggers toast with id 'image-invalid'", () => {
  toastImageInvalid()
  expect(toast.error).toHaveBeenCalledWith(
    "Invalid image",
    expect.objectContaining({
      id: "image-invalid",
      description: "The image format or data is invalid.",
    }),
  )
})

test("toastImageUploadFailed triggers toast with id 'image-upload-failed'", () => {
  toastImageUploadFailed()
  expect(toast.error).toHaveBeenCalledWith(
    "Image upload failed",
    expect.objectContaining({
      id: "image-upload-failed",
      description: "Could not upload image. Please try again.",
    }),
  )
})

test("markImageStatus updates matching image element status", () => {
  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
    { id: "e2", type: "rectangle" },
  ]
  const updateScene = vi.fn()
  const api = {
    getSceneElementsIncludingDeleted: () => elements,
    updateScene,
  } as unknown as Parameters<typeof markImageStatus>[0]

  markImageStatus(api, "f1", "saved")
  expect(updateScene).toHaveBeenCalledWith({
    elements: [
      { id: "e1", type: "image", fileId: "f1", status: "saved" },
      { id: "e2", type: "rectangle" },
    ],
    captureUpdate: "never",
  })
})

function fakeApi(elements: unknown[]) {
  const currentElements = [...elements]
  return {
    getSceneElementsIncludingDeleted: () => currentElements,
    updateScene: vi.fn(({ elements }: { elements: unknown[] }) => {
      currentElements.length = 0
      currentElements.push(...elements)
    }),
    getFiles: () => ({}),
    addFiles: vi.fn(),
  }
}

const mockFile = {
  id: "f1",
  mimeType: "image/png",
  dataURL: "data:image/png;base64,abc",
  created: 1,
}

test("uploadPending on outcome 'too-large' triggers toastImageTooLarge and marks error", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("too-large")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()

  expect(toast.error).toHaveBeenCalledWith(
    "Image too large",
    expect.objectContaining({ id: "image-too-large" }),
  )
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "error" }),
      ]),
    }),
  )
})

test("uploadPending on outcome 'rate-limited' triggers toastImageRateLimited and marks error", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("rate-limited")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()

  expect(toast.error).toHaveBeenCalledWith(
    "Upload limit reached",
    expect.objectContaining({ id: "image-rate-limited" }),
  )
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "error" }),
      ]),
    }),
  )
})

test("uploadPending on outcome 'invalid' triggers toastImageInvalid and marks error", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("invalid")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()

  expect(toast.error).toHaveBeenCalledWith(
    "Invalid image",
    expect.objectContaining({ id: "image-invalid" }),
  )
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "error" }),
      ]),
    }),
  )
})

test("uploadPending on outcome 'full' triggers toastImageCapFull and marks error", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("full")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()

  expect(toast.error).toHaveBeenCalledWith(
    "This drawing can't hold more images",
    expect.objectContaining({ id: "image-cap-full" }),
  )
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "error" }),
      ]),
    }),
  )
})

test("uploadPending on network 'failed' retries then toasts and marks error on 3rd attempt", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("failed")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  // Attempt 1: retryable, no error toast yet
  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()
  expect(toast.error).not.toHaveBeenCalled()
  expect(api.updateScene).not.toHaveBeenCalled()

  // Attempt 2: retryable, no error toast yet
  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()
  expect(toast.error).not.toHaveBeenCalled()

  // Attempt 3: exhausted max attempts -> toast and error
  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()
  expect(toast.error).toHaveBeenCalledWith(
    "Image upload failed",
    expect.objectContaining({ id: "image-upload-failed" }),
  )
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "error" }),
      ]),
    }),
  )
})

test("uploadPending on outcome 'stored' marks saved without error toast", async () => {
  vi.spyOn(fileTransport, "uploadRoomFile").mockResolvedValue("stored")
  const api = fakeApi([
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ])

  const { result } = renderHook(() =>
    useRoomFiles({
      room: roomPathForToken("tok-1"),
      excalidrawAPI: api as never,
      storedFileIds: [],
    }),
  )

  const elements = [
    { id: "e1", type: "image", fileId: "f1", status: "pending" },
  ] as unknown as readonly SceneElement[]

  result.current.uploadPending(elements, { f1: mockFile as never })
  await result.current.flushUploads()

  expect(toast.error).not.toHaveBeenCalled()
  expect(api.updateScene).toHaveBeenCalledWith(
    expect.objectContaining({
      elements: expect.arrayContaining([
        expect.objectContaining({ fileId: "f1", status: "saved" }),
      ]),
    }),
  )
})
