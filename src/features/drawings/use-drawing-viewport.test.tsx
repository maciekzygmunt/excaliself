import type { AppState } from "@excalidraw/excalidraw/types"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useDrawingViewport } from "./use-drawing-viewport"

const view = (scrollX: number, scrollY: number, zoom: number) => ({
  scrollX,
  scrollY,
  zoom: { value: zoom as AppState["zoom"]["value"] },
})
const initialData = { appState: view(10, 20, 1) }

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

test("saves a pan and a zoom-only change on navigation and restores per drawing", () => {
  const first = renderHook(() => useDrawingViewport("drawing", initialData))
  const { observeViewport, getInitialData } = first.result.current
  expect(getInitialData()).toBe(initialData)
  observeViewport(view(10, 20, 1), false)
  expect(localStorage.length).toBe(0)
  observeViewport(view(-30, 48, 1), false)
  observeViewport(view(-30, 48, 1.5), false)
  first.unmount()

  const reopen = (drawingId: string) =>
    renderHook(() =>
      useDrawingViewport(drawingId, initialData),
    ).result.current.getInitialData()
  expect(reopen("drawing")?.appState).toEqual(view(-30, 48, 1.5))
  expect(reopen("other")).toBe(initialData)
})

test("flushes on page exit and keeps the last personal view after following", () => {
  const first = renderHook(() => useDrawingViewport("drawing", initialData))
  const { observeViewport, getInitialData } = first.result.current
  observeViewport(view(10, 20, 1), false)
  observeViewport(view(24, 32, 2), false)
  act(() => window.dispatchEvent(new Event("pagehide")))
  expect(getInitialData()?.appState).toEqual(view(24, 32, 2))

  observeViewport(view(100, 120, 3), true)
  observeViewport(view(100, 120, 3), false)
  first.unmount()
  expect(getInitialData()?.appState).toEqual(view(24, 32, 2))
})

test("uses the fitted view when stored data is invalid or storage is blocked", () => {
  localStorage.setItem(
    "excaliself:viewport:drawing",
    '{"scrollX":0,"scrollY":0,"zoom":0}',
  )
  const { result } = renderHook(() =>
    useDrawingViewport("drawing", initialData),
  )
  expect(result.current.getInitialData()).toBe(initialData)
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage disabled", "SecurityError")
  })
  expect(result.current.getInitialData()).toBe(initialData)
})

test("fits the content only when no view is saved", () => {
  const scene = { elements: [{ id: "a", isDeleted: false }] } as never
  const open = () =>
    renderHook(() => useDrawingViewport("drawing", scene)).result.current
      .initialState
  expect(open()?.viewport?.fit).toBe("scale-down")
  localStorage.setItem(
    "excaliself:viewport:drawing",
    '{"scrollX":5,"scrollY":5,"zoom":2}',
  )
  expect(open()).toBeUndefined()
})
