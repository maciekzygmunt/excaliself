import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { renderPreviewSvg } from "@/components/drawing-gallery/preview"
import type { Drawing } from "@/features/drawings/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { getDrawings } from "@/features/drawings/server"
import type { Folder } from "@/features/folders/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { AllDrawings } from "./AllDrawings"

const { openCreateDrawingDialog, openCreateFolderDialog } = vi.hoisted(() => ({
  openCreateDrawingDialog: vi.fn(),
  openCreateFolderDialog: vi.fn(),
}))

vi.mock("./CreateDialog", () => ({
  useCreateDialog: () => ({ openCreateDrawingDialog, openCreateFolderDialog }),
}))

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string
    params?: Record<string, string>
    children: React.ReactNode
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      {...rest}
    >
      {children}
    </a>
  ),
}))

// jsdom cannot rasterize Excalidraw scenes — assert cards, not pixels.
vi.mock("@/components/drawing-gallery/preview", () => ({
  renderPreviewSvg: vi.fn(),
}))

// The query modules import the server functions, which import the db — stub
// the server-function edge (the caches are seeded, so they are never called).
vi.mock("@/features/drawings/server", () => ({
  getDrawings: vi.fn(),
  getDrawingWithFiles: vi.fn(),
}))

vi.mock("@/features/folders/server", () => ({
  getFolders: vi.fn(),
}))

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(renderPreviewSvg).mockResolvedValue(null)
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function makeDrawing(overrides: Partial<Drawing> & { id: string }): Drawing {
  return {
    name: `Drawing ${overrides.id}`,
    data: "{}",
    thumbnail: null,
    folderId: null,
    ownerId: "user-1",
    isPublic: false,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function renderAllDrawings({
  drawings = [],
  folders = [],
  isAdmin = false,
}: {
  drawings?: Drawing[]
  folders?: Folder[]
  isAdmin?: boolean
} = {}) {
  // Seeded data is the fixture — keep react-query from refetching it through
  // the stubbed server functions.
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(drawingsQueryOptions().queryKey, drawings)
  client.setQueryData(foldersQueryOptions().queryKey, folders)
  return render(
    <QueryClientProvider client={client}>
      <AllDrawings isAdmin={isAdmin} />
    </QueryClientProvider>,
  )
}

test("every drawing renders, newest-edited first — no recents cap", () => {
  const drawings = Array.from({ length: 12 }, (_, i) =>
    makeDrawing({ id: `d${i}`, updatedAt: new Date(Date.UTC(2026, 0, 1 + i)) }),
  )
  const shuffled = [drawings[5], ...drawings.filter((_, i) => i !== 5)]

  renderAllDrawings({ drawings: shuffled })

  const cards = screen.getAllByRole("link")
  expect(cards.map((card) => card.getAttribute("href"))).toEqual(
    Array.from({ length: 12 }, (_, i) => `/draw/d${11 - i}`),
  )
})

test("cards carry folder attribution in the All view", () => {
  renderAllDrawings({
    drawings: [makeDrawing({ id: "d1", name: "Retro board", folderId: "f1" })],
    folders: [
      {
        id: "f1",
        name: "Projects",
        ownerId: "user-1",
        parentId: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
      },
    ],
  })

  expect(screen.getByText("Projects")).toBeTruthy()
})

test("the tab reads All drawings · Excaliself", () => {
  renderAllDrawings({ drawings: [makeDrawing({ id: "d1" })] })

  expect(document.title).toBe("All drawings · Excaliself")
})

test("the page is headed All drawings", () => {
  renderAllDrawings({ drawings: [makeDrawing({ id: "d1" })] })

  expect(screen.getByRole("heading", { name: /all drawings/i })).toBeTruthy()
})

test("zero drawings shows the illustrated empty state with a working create action", () => {
  renderAllDrawings({ drawings: [] })

  fireEvent.click(
    screen.getByRole("button", { name: /create your first drawing/i }),
  )
  expect(openCreateDrawingDialog).toHaveBeenCalledTimes(1)
  // Argumentless — a leaked click event would masquerade as a folder scope
  expect(openCreateDrawingDialog).toHaveBeenCalledWith()
})

test("admins get the invite variant of the empty state", () => {
  renderAllDrawings({ drawings: [], isAdmin: true })

  expect(screen.getByRole("link", { name: /invite your team/i })).toBeTruthy()
})

test("loading holds the grid with the delayed skeleton, not a spinner", () => {
  vi.useFakeTimers()
  vi.mocked(getDrawings).mockReturnValue(new Promise(() => {}))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(foldersQueryOptions().queryKey, [])
  render(
    <QueryClientProvider client={client}>
      <AllDrawings isAdmin={false} />
    </QueryClientProvider>,
  )

  // Spec §4.3: nothing during the 150ms grace period…
  expect(screen.queryByRole("status")).toBeNull()
  act(() => vi.advanceTimersByTime(150))

  // …then skeleton cards mirroring the grid
  const loading = screen.getByRole("status", { name: /loading/i })
  expect(
    loading.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(0)
  expect(
    screen.queryByRole("button", { name: /create your first drawing/i }),
  ).toBeNull()
})
