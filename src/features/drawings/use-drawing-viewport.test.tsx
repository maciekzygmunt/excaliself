import type { AppState } from "@excalidraw/excalidraw/types"
import { act, cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useDrawingViewport } from "./use-drawing-viewport"

const view = (scrollX: number, scrollY: number, zoom: number) => ({
  scrollX,
  scrollY,
  zoom: { value: zoom as AppState["zoom"]["value"] },
  userToFollow: null,
})
const initialData = { appState: view(10, 20, 1) }

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.restoreAllMocks()
})

test("saves a pan and a zoom-only change on navigation and restores per viewer and drawing", () => {
  const first = renderHook(() =>
    useDrawingViewport("drawing", "ada", initialData),
  )
  const { observeViewport, getInitialData } = first.result.current
  expect(getInitialData()).toBe(initialData)
  observeViewport(view(10, 20, 1))
  expect(localStorage.length).toBe(0)
  observeViewport(view(-30, 48, 1))
  observeViewport(view(-30, 48, 1.5))
  first.unmount()

  const reopen = (drawingId: string, userId: string | null) =>
    renderHook(() =>
      useDrawingViewport(drawingId, userId, initialData),
    ).result.current.getInitialData()
  expect(reopen("drawing", "ada")?.appState).toEqual(view(-30, 48, 1.5))
  expect(reopen("other", "ada")).toBe(initialData)
  expect(reopen("drawing", "bert")).toBe(initialData)
  expect(reopen("drawing", null)).toBe(initialData)
})

test("flushes on page exit and keeps the last personal view after following", () => {
  const first = renderHook(() =>
    useDrawingViewport("drawing", null, initialData),
  )
  const { observeViewport, getInitialData } = first.result.current
  observeViewport(view(10, 20, 1))
  observeViewport(view(24, 32, 2))
  act(() => window.dispatchEvent(new Event("pagehide")))
  expect(getInitialData()?.appState).toEqual(view(24, 32, 2))

  observeViewport({
    ...view(100, 120, 3),
    userToFollow: {
      socketId: "remote" as NonNullable<AppState["userToFollow"]>["socketId"],
      username: "Bert",
    },
  })
  observeViewport(view(100, 120, 3))
  first.unmount()
  expect(getInitialData()?.appState).toEqual(view(24, 32, 2))
})

test("uses the fitted view when stored data is invalid or storage is blocked", () => {
  localStorage.setItem(
    'excaliself:viewport:[null,"drawing"]',
    '{"scrollX":0,"scrollY":0,"zoom":0}',
  )
  const { result } = renderHook(() =>
    useDrawingViewport("drawing", null, initialData),
  )
  expect(result.current.getInitialData()).toBe(initialData)
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("Storage disabled", "SecurityError")
  })
  expect(result.current.getInitialData()).toBe(initialData)
})
