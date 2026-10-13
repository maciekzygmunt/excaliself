/**
 * What the client does with the server's answer to a scene save — in
 * particular the refusal a shared drawing gets (canvas sharing spec §5.5).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render, renderHook, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { expect, test, vi } from "vitest"
import { drawingQueryOptions } from "./queries"
import {
  type ScenePayload,
  useReloadSceneAfterRoom,
  useSaveScenePayload,
} from "./scene"
import { getDrawingWithFiles, saveDrawingScene } from "./server"

// `@excalidraw/excalidraw` can't be loaded outside the browser build; the
// helpers this module imports from it are not on the path under test.
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { NEVER: "NEVER" },
  hashString: (value: string) => value.length,
  restore: (data: { elements?: unknown[] } | null) => ({
    elements: data?.elements ?? [],
    appState: {},
    files: {},
  }),
  serializeAsJSON: () => "{}",
}))

vi.mock("./server", () => ({
  getDrawingWithFiles: vi.fn(),
  saveDrawingScene: vi.fn(),
}))
// Reached through the share query options; its module body opens the live db.
vi.mock("@/features/shares/server", () => ({ getDrawingShare: vi.fn() }))

const PAYLOAD: ScenePayload = { data: '{"elements":[]}', files: [] }

const DRAWING = {
  id: "d1",
  name: "Sketch",
  data: '{"elements":[]}',
  updatedAt: new Date("2026-07-01"),
  files: [],
}

function renderSaver(
  drawing: object = DRAWING,
  onOverCap: (fileIds: string[]) => void = () => {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // Only the fields this path reads; the row has a dozen more.
  queryClient.setQueryData(drawingQueryOptions("d1").queryKey, drawing as never)
  const saveRef = {
    current: null as ((payload: typeof PAYLOAD) => Promise<unknown>) | null,
  }
  function Harness() {
    saveRef.current = useSaveScenePayload("d1", onOverCap)
    return null
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(<Harness />, { wrapper })
  return { queryClient, saveRef }
}

test("a committed save is mirrored into the drawing cache", async () => {
  vi.mocked(saveDrawingScene).mockResolvedValue({
    status: "saved",
    missingFileIds: [],
    overCapFileIds: [],
  })
  const { queryClient, saveRef } = renderSaver()

  await act(async () => {
    await saveRef.current?.({ ...PAYLOAD, data: '{"elements":["new"]}' })
  })

  expect(
    queryClient.getQueryData(drawingQueryOptions("d1").queryKey)?.data,
  ).toBe('{"elements":["new"]}')
})

// A tab that was still saving solo when the drawing got shared — from another
// tab, or from this one before its share query caught up. The write is
// refused rather than failing, and refetching the share is what flips this
// canvas into collab mode, where the local scene is reconciled in.
test("a refused save leaves the cache alone and refetches the share", async () => {
  vi.mocked(saveDrawingScene).mockResolvedValue({ status: "shared" })
  const { queryClient, saveRef } = renderSaver()
  const invalidate = vi.spyOn(queryClient, "invalidateQueries")

  await act(async () => {
    await saveRef.current?.({ ...PAYLOAD, data: '{"elements":["new"]}' })
  })

  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["shares", "d1"] })
  expect(
    queryClient.getQueryData(drawingQueryOptions("d1").queryKey)?.data,
  ).toBe(DRAWING.data)
})

const file = (fileId: string) => ({
  fileId,
  mimeType: "image/png",
  dataUrl: `data:image/png;base64,${fileId}`,
})

const sentFileIds = (call: number) =>
  vi
    .mocked(saveDrawingScene)
    .mock.calls[call][0].data.files.map((sent) => sent.fileId)

test("image bytes go up once: stored images are not sent again", async () => {
  vi.mocked(saveDrawingScene).mockReset().mockResolvedValue({
    status: "saved",
    missingFileIds: [],
    overCapFileIds: [],
  })
  const { saveRef } = renderSaver({ ...DRAWING, files: [file("old")] })

  await act(async () => {
    await saveRef.current?.({ ...PAYLOAD, files: [file("old"), file("new")] })
  })

  expect(sentFileIds(0)).toEqual(["new"])
})

// Another tab removed the image and saved, so this tab's cache is stale.
test("images the server reports missing are sent again", async () => {
  vi.mocked(saveDrawingScene)
    .mockReset()
    .mockResolvedValueOnce({
      status: "saved",
      missingFileIds: ["old"],
      overCapFileIds: [],
    })
    .mockResolvedValueOnce({
      status: "saved",
      missingFileIds: [],
      overCapFileIds: [],
    })
  const { saveRef } = renderSaver({ ...DRAWING, files: [file("old")] })

  await act(async () => {
    await saveRef.current?.({ ...PAYLOAD, files: [file("old")] })
  })

  expect(sentFileIds(0)).toEqual([])
  expect(sentFileIds(1)).toEqual(["old"])
})

// A tab asleep while guests drew wakes to a dead link with its old scene.
function renderReload() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const api = { addFiles: vi.fn(), updateScene: vi.fn() }
  const hook = renderHook(
    ({ isShared }) => useReloadSceneAfterRoom("d1", isShared, api as never),
    {
      initialProps: { isShared: true },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
      ),
    },
  )
  return { api, hook }
}

test("leaving a room holds autosave until the stored scene is on the canvas", async () => {
  let answer = (_drawing: unknown) => {}
  vi.mocked(getDrawingWithFiles).mockReturnValue(
    new Promise((resolve) => {
      answer = resolve
    }) as never,
  )
  const { api, hook } = renderReload()
  expect(hook.result.current).toBe(false)

  hook.rerender({ isShared: false })
  expect(hook.result.current).toBe(true)
  expect(api.updateScene).not.toHaveBeenCalled()

  answer({
    ...DRAWING,
    data: '{"elements":[{"id":"guest"}]}',
    files: [file("img")],
  })
  await waitFor(() => expect(hook.result.current).toBe(false))
  expect(api.addFiles).toHaveBeenCalledWith([
    expect.objectContaining({ id: "img" }),
  ])
  expect(api.updateScene).toHaveBeenCalledWith({
    elements: [{ id: "guest" }],
    captureUpdate: "NEVER",
  })
})

test("a failed reload keeps autosave held", async () => {
  vi.mocked(getDrawingWithFiles).mockRejectedValue(new Error("offline"))
  const { api, hook } = renderReload()

  hook.rerender({ isShared: false })
  await waitFor(() => expect(getDrawingWithFiles).toHaveBeenCalled())
  await act(async () => {})

  expect(hook.result.current).toBe(true)
  expect(api.updateScene).not.toHaveBeenCalled()
})

// Else the next save would skip them as stored, and they'd never show refused.
test("images refused at the image cap are reported and kept out of the cache", async () => {
  vi.mocked(saveDrawingScene)
    .mockReset()
    .mockResolvedValue({
      status: "saved",
      missingFileIds: [],
      overCapFileIds: ["big"],
    })
  const onOverCap = vi.fn()
  const { queryClient, saveRef } = renderSaver(DRAWING, onOverCap)

  await act(async () => {
    await saveRef.current?.({ ...PAYLOAD, files: [file("ok"), file("big")] })
  })

  expect(onOverCap).toHaveBeenCalledWith(["big"])
  expect(
    queryClient
      .getQueryData(drawingQueryOptions("d1").queryKey)
      ?.files.map((cached) => cached.fileId),
  ).toEqual(["ok"])
})
