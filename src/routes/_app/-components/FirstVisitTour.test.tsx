import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import { FirstVisitTour, TOUR_STEPS } from "./FirstVisitTour"

vi.mock("@tanstack/react-router", () => ({
  // Always on Home.
  useMatchRoute: () => () => ({}),
}))

beforeEach(() => {
  localStorage.clear()
  // jsdom has no matchMedia; at its 1024 px width the sidebar is desktop.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

/** Only the New drawing button exists, so every later step has no target. */
function renderTour(userId = "ada") {
  return render(
    <SidebarProvider defaultOpen>
      <button type="button" data-tour="new-drawing">
        New drawing
      </button>
      <FirstVisitTour userId={userId} />
    </SidebarProvider>,
  )
}

test("skips steps with nothing to point at, then stays done for the account", async () => {
  const first = renderTour()
  expect(await screen.findByText(`1 of ${TOUR_STEPS.length}`)).toBeDefined()

  fireEvent.click(screen.getByRole("button", { name: "Next" }))
  await vi.waitFor(() => expect(screen.queryByText(/ of /)).toBeNull())

  first.unmount()
  renderTour()
  await new Promise((resolve) => setTimeout(resolve, 50))
  expect(screen.queryByText(/ of /)).toBeNull()
})

test("another account on the same browser still gets the tour", async () => {
  const first = renderTour("ada")
  fireEvent.click(await screen.findByRole("button", { name: "Skip tour" }))
  first.unmount()

  renderTour("grace")
  expect(await screen.findByText(`1 of ${TOUR_STEPS.length}`)).toBeDefined()
})
