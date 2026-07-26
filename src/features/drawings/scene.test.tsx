/**
 * What the client does with the server's answer to a scene save — in
 * particular the refusal a shared drawing gets (canvas sharing spec §5.5).
 */

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, render } from "@testing-library/react"
import type { ReactNode } from "react"
import { expect, test, vi } from "vitest"
import { drawingQueryOptions } from "./queries"
import { useSaveScenePayload } from "./scene"
import { saveDrawingScene } from "./server"

// `@excalidraw/excalidraw` can't be loaded outside the browser build; the
// helpers this module imports from it are not on the path under test.
vi.mock("@excalidraw/excalidraw", () => ({
  hashString: (value: string) => value.length,
  restore: () => ({ elements: [], appState: {}, files: {} }),
  serializeAsJSON: () => "{}",
}))

vi.mock("./server", () => ({ saveDrawingScene: vi.fn() }))
// Reached through the share query options; its module body opens the live db.
vi.mock("@/features/shares/server", () => ({ getDrawingShare: vi.fn() }))

const PAYLOAD = { data: '{"elements":[]}', files: [] }

const DRAWING = {
  id: "d1",
  name: "Sketch",
  data: '{"elements":[]}',
  updatedAt: new Date("2026-07-01"),
  files: [],
}

function renderSaver() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  // Only the fields this path reads; the row has a dozen more.
  queryClient.setQueryData(drawingQueryOptions("d1").queryKey, DRAWING as never)
  const saveRef = {
    current: null as ((payload: typeof PAYLOAD) => Promise<unknown>) | null,
  }
  function Harness() {
    saveRef.current = useSaveScenePayload("d1")
    return null
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(<Harness />, { wrapper })
  return { queryClient, saveRef }
}

test("a committed save is mirrored into the drawing cache", async () => {
  vi.mocked(saveDrawingScene).mockResolvedValue({ status: "saved" })
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
