import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import { FirstVisitTour } from "./FirstVisitTour"

let onHome = true
vi.mock("@tanstack/react-router", () => ({
  useMatchRoute: () => () => (onHome ? {} : false),
}))
vi.mock("./ActiveSpace", () => ({
  useActiveSpace: () => ({ activeSpace: "private" }),
}))

beforeEach(() => {
  localStorage.clear()
  onHome = true
  // jsdom has no matchMedia; at its 1024 px width the sidebar is desktop.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
  // jsdom lays nothing out; the tour skips zero-size targets.
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 100, 30),
  )
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** The sidebar targets, plus the editor's Share button when `drawing`. */
function tree({ drawing = false, onNewDrawing = () => {} } = {}) {
  return (
    <SidebarProvider defaultOpen>
      <div data-tour="spaces" />
      <button type="button" data-tour="search">
        Search
      </button>
      <button type="button" data-tour="new-drawing" onClick={onNewDrawing}>
        New drawing
      </button>
      {drawing && (
        <button type="button" data-tour="share">
          Share
        </button>
      )}
      <FirstVisitTour userId="ada" />
    </SidebarProvider>
  )
}

test("a reload resumes the tour at the saved step", async () => {
  const first = render(tree())
  fireEvent.click(await screen.findByRole("button", { name: "Next" }))
  expect(await screen.findByText("2 of 4")).toBeDefined()

  first.unmount()
  render(tree())
  expect(await screen.findByText("2 of 4")).toBeDefined()
})

test("Make a drawing uses the real button, and the tour ends at Share", async () => {
  localStorage.setItem("excaliself:tour:ada", "new-drawing")
  const onNewDrawing = vi.fn()
  const view = render(tree({ onNewDrawing }))

  fireEvent.click(await screen.findByRole("button", { name: "Make a drawing" }))
  expect(onNewDrawing).toHaveBeenCalledOnce()
  await vi.waitFor(() => expect(screen.queryByText(/ of 4/)).toBeNull())

  onHome = false
  view.rerender(tree({ drawing: true }))
  fireEvent.click(await screen.findByRole("button", { name: "Done" }))
  expect(localStorage.getItem("excaliself:tour:ada")).toBe("done")
})

test("a dialog on top pauses the tour", async () => {
  render(tree())
  await screen.findByText("1 of 4")

  const dialog = document.createElement("div")
  dialog.dataset.slot = "dialog-content"
  document.body.append(dialog)
  await vi.waitFor(() => expect(screen.queryByText("1 of 4")).toBeNull())

  dialog.remove()
  expect(await screen.findByText("1 of 4")).toBeDefined()
})

test("blocked storage means no tour, not a crash", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new DOMException("denied", "SecurityError")
  })
  render(tree())
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByText(/ of 4/)).toBeNull()
})
