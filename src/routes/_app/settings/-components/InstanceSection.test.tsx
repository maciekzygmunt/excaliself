import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { instanceStatsQueryOptions } from "@/features/instance/queries"
import { getInstanceStats } from "@/features/instance/server"
import { InstanceSection } from "./InstanceSection"

// The query module imports the server function, which imports the db — stub
// the server-function edge (the cache is seeded, so it is never called).
vi.mock("@/features/instance/server", () => ({
  getInstanceStats: vi.fn(),
}))

const stats = {
  version: "0.1.0",
  userCount: 3,
  drawingCount: 12,
  storageBytes: 1572864,
}

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderSection({ seed = true } = {}) {
  const queryClient = new QueryClient()
  if (seed) {
    queryClient.setQueryData(instanceStatsQueryOptions().queryKey, stats)
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <InstanceSection />
    </QueryClientProvider>,
  )
}

test("the About page shows version, user count, drawing count, and storage", () => {
  renderSection()
  expect(screen.getByText("v0.1.0")).not.toBeNull()
  expect(screen.getByText("3")).not.toBeNull()
  expect(screen.getByText("12")).not.toBeNull()
  expect(screen.getByText("1.5 MB")).not.toBeNull()
})

test("the releases link points at the project's GitHub releases", () => {
  renderSection()
  const link = screen.getByRole("link", { name: "Release notes on GitHub" })
  expect(link.getAttribute("href")).toBe(
    "https://github.com/maciekzygmunt/excaliself/releases",
  )
})

test("the page is read-only — no controls anywhere", () => {
  renderSection()
  expect(screen.queryAllByRole("button")).toHaveLength(0)
  expect(screen.queryAllByRole("textbox")).toHaveLength(0)
  expect(screen.queryAllByRole("checkbox")).toHaveLength(0)
})

test("the skeleton appears only after the grace period", () => {
  vi.useFakeTimers()
  vi.mocked(getInstanceStats).mockReturnValue(new Promise(() => {}))
  const { container } = renderSection({ seed: false })

  // Within the grace period nothing renders — no skeleton flash.
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull()

  act(() => vi.advanceTimersByTime(150))
  expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull()
})
