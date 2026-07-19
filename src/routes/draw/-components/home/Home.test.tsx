import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Drawing } from "@/features/drawings/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import { getDrawings } from "@/features/drawings/server"
import type { Folder } from "@/features/folders/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { Home } from "./Home"
import { renderPreviewSvg } from "./preview"

const { openCreateDrawingDialog, openCreateFolderDialog } = vi.hoisted(() => ({
  openCreateDrawingDialog: vi.fn(),
  openCreateFolderDialog: vi.fn(),
}))

vi.mock("../CreateDialog", () => ({
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

// jsdom cannot rasterize Excalidraw scenes — assert the renderer is invoked
// with the right scene, not pixels.
vi.mock("./preview", () => ({
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
afterEach(cleanup)

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

function renderHome({
  drawings = [],
  folders = [],
}: {
  drawings?: Drawing[]
  folders?: Folder[]
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
      <Home />
    </QueryClientProvider>,
  )
}

test("shows at most the 8 most recently edited drawings, newest first", () => {
  const drawings = Array.from({ length: 10 }, (_, i) =>
    makeDrawing({
      id: `d${i}`,
      name: `Drawing ${i}`,
      // d9 is the most recent, d0 the oldest
      updatedAt: new Date(Date.UTC(2026, 0, 1 + i)),
    }),
  )
  // The server orders by updatedAt, but the cache is mutated in place by
  // autosave without reordering — Home must sort for itself.
  const shuffled = [drawings[3], ...drawings.filter((_, i) => i !== 3)]

  renderHome({ drawings: shuffled })

  const cards = screen.getAllByRole("link")
  expect(cards).toHaveLength(8)
  expect(cards.map((card) => card.getAttribute("href"))).toEqual([
    "/draw/d9",
    "/draw/d8",
    "/draw/d7",
    "/draw/d6",
    "/draw/d5",
    "/draw/d4",
    "/draw/d3",
    "/draw/d2",
  ])
  expect(screen.queryByText("Drawing 1")).toBeNull()
  expect(screen.queryByText("Drawing 0")).toBeNull()
})

test("a card shows the drawing's name, folder, and relative edit time", () => {
  const now = Date.now()
  renderHome({
    drawings: [
      makeDrawing({
        id: "d1",
        name: "Retro board",
        folderId: "f1",
        updatedAt: new Date(now - 5 * 60 * 1000),
      }),
    ],
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

  expect(screen.getByText("Retro board")).toBeTruthy()
  expect(screen.getByText("Projects")).toBeTruthy()
  expect(screen.getByText(/5m ago/)).toBeTruthy()
})

// Regression (caught in review): 360-364 days floored to "0y ago"
test("a drawing edited just under a year ago reads in months, not zero years", () => {
  renderHome({
    drawings: [
      makeDrawing({
        id: "d1",
        updatedAt: new Date(Date.now() - 362 * 24 * 60 * 60 * 1000),
      }),
    ],
  })

  expect(screen.getByText(/11mo ago/)).toBeTruthy()
})

test("a card without a folder omits the folder label", () => {
  renderHome({
    drawings: [makeDrawing({ id: "d1", name: "Loose sketch" })],
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

  expect(screen.getByText("Loose sketch")).toBeTruthy()
  expect(screen.queryByText("Projects")).toBeNull()
})

test("cards link to their drawing's canvas", () => {
  renderHome({ drawings: [makeDrawing({ id: "d1", name: "Retro board" })] })

  const card = screen.getByRole("link", { name: /retro board/i })
  expect(card.getAttribute("href")).toBe("/draw/d1")
})

test("the preview renderer is invoked with each drawing's scene", async () => {
  const scene = JSON.stringify({ elements: [{ type: "rectangle" }] })
  renderHome({ drawings: [makeDrawing({ id: "d1", data: scene })] })

  expect(renderPreviewSvg).toHaveBeenCalledWith(scene)

  // The resolved SVG lands inside the card
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
  vi.mocked(renderPreviewSvg).mockResolvedValue(svg)
  cleanup()
  renderHome({ drawings: [makeDrawing({ id: "d1", data: scene })] })
  await screen.findByLabelText(/preview of/i)
})

test("a preview fades in when its render resolves, without flashing the placeholder", async () => {
  let resolveRender!: (svg: SVGSVGElement | null) => void
  vi.mocked(renderPreviewSvg).mockImplementation(
    () =>
      new Promise((resolve) => {
        resolveRender = resolve
      }),
  )
  renderHome({ drawings: [makeDrawing({ id: "d1" })] })

  // Mid-load: the container is transparent and set up to fade, and the
  // "no preview" pencil is not showing
  const container = screen.getByRole("img")
  expect(container.className).toContain("opacity-0")
  expect(container.className).toContain("transition-opacity")
  expect(container.className).toContain("duration-200")
  expect(container.className).toContain("ease-out")
  expect(screen.queryByLabelText(/no preview/i)).toBeNull()

  resolveRender(document.createElementNS("http://www.w3.org/2000/svg", "svg"))

  // Resolved: the same container transitions to full opacity
  const ready = await screen.findByLabelText(/preview of/i)
  expect(ready.className).toContain("opacity-100")
  expect(ready.className).not.toContain("opacity-0")
})

test("a drawing whose scene cannot be rendered gets a placeholder card", async () => {
  vi.mocked(renderPreviewSvg).mockResolvedValue(null)
  renderHome({
    drawings: [
      makeDrawing({ id: "d1", name: "Corrupt one", data: "not json" }),
    ],
  })

  expect(await screen.findByLabelText(/no preview/i)).toBeTruthy()
  // The card itself still renders
  expect(screen.getByText("Corrupt one")).toBeTruthy()
})

test("a rejected preview render is contained to a placeholder, not a crash", async () => {
  vi.mocked(renderPreviewSvg).mockRejectedValue(new Error("boom"))
  renderHome({
    drawings: [makeDrawing({ id: "d1", name: "Still here" })],
  })

  expect(await screen.findByLabelText(/no preview/i)).toBeTruthy()
  expect(screen.getByText("Still here")).toBeTruthy()
})

test("the New drawing button opens the Create dialog", () => {
  renderHome({ drawings: [makeDrawing({ id: "d1" })] })

  fireEvent.click(screen.getByRole("button", { name: /new drawing/i }))
  expect(openCreateDrawingDialog).toHaveBeenCalledTimes(1)
})

test("while drawings load, skeleton cards hold the grid — no empty state flash", () => {
  // No seeded drawings cache: the query goes through the (never-resolving)
  // server function, holding Home in its loading state
  vi.mocked(getDrawings).mockReturnValue(new Promise(() => {}))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  client.setQueryData(foldersQueryOptions().queryKey, [])
  render(
    <QueryClientProvider client={client}>
      <Home />
    </QueryClientProvider>,
  )

  const loading = screen.getByRole("status", { name: /loading/i })
  expect(
    loading.querySelectorAll('[data-slot="skeleton"]').length,
  ).toBeGreaterThan(0)
  expect(screen.queryByText(/no drawings yet/i)).toBeNull()
  expect(screen.queryAllByRole("link")).toHaveLength(0)
})

test("loaded drawings show cards, not skeletons", () => {
  renderHome({ drawings: [makeDrawing({ id: "d1" })] })

  expect(screen.queryByRole("status")).toBeNull()
  expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
})

test("the loaded grid fades in instead of swapping in a single frame", () => {
  renderHome({ drawings: [makeDrawing({ id: "d1" })] })

  const grid = screen.getAllByRole("link")[0].parentElement
  expect(grid?.className).toContain("animate-in")
  expect(grid?.className).toContain("fade-in-0")
})

test("the empty state fades in instead of swapping in a single frame", () => {
  renderHome({ drawings: [] })

  const emptyState = screen.getByText(/no drawings yet/i).parentElement
  expect(emptyState?.className).toContain("animate-in")
  expect(emptyState?.className).toContain("fade-in-0")
})

test("zero drawings shows the empty state with a working create action", () => {
  renderHome({ drawings: [] })

  expect(screen.getByText(/no drawings yet/i)).toBeTruthy()
  expect(screen.queryAllByRole("link")).toHaveLength(0)

  fireEvent.click(
    screen.getByRole("button", { name: /create your first drawing/i }),
  )
  expect(openCreateDrawingDialog).toHaveBeenCalledTimes(1)
})
