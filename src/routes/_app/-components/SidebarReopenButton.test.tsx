import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import { SidebarReopenButton } from "./SidebarReopenButton"

const { matchRoute } = vi.hoisted(() => ({ matchRoute: vi.fn() }))

vi.mock("@tanstack/react-router", () => ({
  useMatchRoute: () => matchRoute,
}))

beforeEach(() => {
  vi.clearAllMocks()
  // Not on the draw page unless a test says so
  matchRoute.mockReturnValue(false)
  // jsdom has no matchMedia; SidebarProvider's useIsMobile needs one.
  // window.innerWidth is 1024 here, so the provider resolves to desktop.
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

function renderShell({ defaultOpen }: { defaultOpen: boolean }) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen}>
      <SidebarReopenButton />
    </SidebarProvider>,
  )
}

test("no button while the sidebar is expanded", () => {
  renderShell({ defaultOpen: true })

  expect(screen.queryByRole("button", { name: /open sidebar/i })).toBeNull()
})

test("a collapsed sidebar shows the button, and clicking it reopens", () => {
  renderShell({ defaultOpen: false })

  fireEvent.click(screen.getByRole("button", { name: /open sidebar/i }))

  // Reopened — the collapsed-only button retires itself
  expect(screen.queryByRole("button", { name: /open sidebar/i })).toBeNull()
})

test("the draw page keeps its own toggle — the shell button stays away", () => {
  // useMatchRoute returns the matched params object for /draw/$id
  matchRoute.mockReturnValue({ id: "d1" })

  renderShell({ defaultOpen: false })

  expect(screen.queryByRole("button", { name: /open sidebar/i })).toBeNull()
  expect(matchRoute).toHaveBeenCalledWith({ to: "/draw/$id" })
})
