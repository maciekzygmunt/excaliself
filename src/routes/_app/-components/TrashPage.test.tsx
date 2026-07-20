import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { renderPreviewSvg } from "@/components/drawing-gallery/preview"
import { restoreDrawing } from "@/features/drawings/server"
import { restoreFolder } from "@/features/folders/server"
import type {
  TrashedDrawing,
  TrashedFolder,
  TrashItems,
} from "@/features/trash/queries"
import { trashQueryOptions } from "@/features/trash/queries"
import { getTrashItems } from "@/features/trash/server"
import { TrashPage } from "./TrashPage"

const { toastMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

// jsdom cannot rasterize Excalidraw scenes — assert cards, not pixels.
vi.mock("@/components/drawing-gallery/preview", () => ({
  renderPreviewSvg: vi.fn(),
}))

// The query/mutation modules import the server functions, which import the
// db — stub the server-function edge.
vi.mock("@/features/trash/server", () => ({
  getTrashItems: vi.fn(),
}))

vi.mock("@/features/drawings/server", () => ({
  getDrawings: vi.fn(),
  getDrawingWithFiles: vi.fn(),
  restoreDrawing: vi.fn(),
}))

vi.mock("@/features/folders/server", () => ({
  getFolders: vi.fn(),
  restoreFolder: vi.fn(),
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

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

function makeTrashedDrawing(
  overrides: Partial<TrashedDrawing> & { id: string },
): TrashedDrawing {
  return {
    name: `Drawing ${overrides.id}`,
    data: "{}",
    thumbnail: null,
    folderId: null,
    ownerId: "user-1",
    isPublic: false,
    starred: false,
    deletedAt: daysAgo(5),
    trashRootId: overrides.id,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeTrashedFolder(
  overrides: Partial<TrashedFolder> & { id: string },
): TrashedFolder {
  return {
    name: `Folder ${overrides.id}`,
    ownerId: "user-1",
    parentId: null,
    deletedAt: daysAgo(2),
    trashRootId: overrides.id,
    itemCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

const fixture: TrashItems = {
  drawings: [
    makeTrashedDrawing({ id: "d1", name: "Old sketch", deletedAt: daysAgo(5) }),
  ],
  folders: [
    makeTrashedFolder({
      id: "f1",
      name: "Archive",
      itemCount: 3,
      deletedAt: daysAgo(2),
    }),
  ],
}

function renderTrashPage(items: TrashItems = fixture) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(trashQueryOptions().queryKey, items)
  vi.mocked(getTrashItems).mockResolvedValue(items)
  const view = render(
    <QueryClientProvider client={client}>
      <TrashPage />
    </QueryClientProvider>,
  )
  return { ...view, client }
}

const flush = () => act(async () => {})

test("trashed drawings show the purge countdown, not edited-ago", () => {
  renderTrashPage()

  expect(screen.getByText("Old sketch")).toBeTruthy()
  expect(screen.getByText("Purges in 25 days")).toBeTruthy()
  expect(screen.queryByText(/ago$/)).toBeNull()
})

test("a trashed folder is one card with a contents count — children never disperse", () => {
  renderTrashPage()

  expect(screen.getByText("Archive")).toBeTruthy()
  expect(screen.getByText(/3 items/)).toBeTruthy()
  // Exactly two cards: the folder unit and the loose drawing
  expect(screen.getAllByRole("button", { name: /^Restore/ })).toHaveLength(2)
})

test("cards are not links — nothing in trash opens", () => {
  renderTrashPage()

  expect(screen.queryAllByRole("link")).toHaveLength(0)
})

test("the most recently trashed unit comes first", () => {
  renderTrashPage()

  const restores = screen.getAllByRole("button", { name: /^Restore/ })
  expect(restores.map((b) => b.getAttribute("aria-label"))).toEqual([
    "Restore Archive",
    "Restore Old sketch",
  ])
})

test("restoring a drawing removes its card optimistically and calls the server", async () => {
  vi.mocked(restoreDrawing).mockReturnValue(new Promise(() => {}))
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Restore Old sketch" }))
  await flush()

  // Gone before the server ever answers
  expect(screen.queryByText("Old sketch")).toBeNull()
  expect(restoreDrawing).toHaveBeenCalledWith({ data: "d1" }, expect.anything())
})

test("restoring a folder calls the folder restore with the unit root", async () => {
  vi.mocked(restoreFolder).mockReturnValue(new Promise(() => {}))
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Restore Archive" }))
  await flush()

  expect(screen.queryByText("Archive")).toBeNull()
  expect(restoreFolder).toHaveBeenCalledWith({ data: "f1" }, expect.anything())
})

test("a failed restore rolls the card back and shows an error toast", async () => {
  vi.mocked(restoreDrawing).mockRejectedValue(new Error("boom"))
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Restore Old sketch" }))
  await flush()

  await waitFor(() => expect(screen.getByText("Old sketch")).toBeTruthy())
  expect(toastMock.error).toHaveBeenCalledWith("Couldn't restore drawing")
})

test("a vanished original folder falls back to root with the specified toast", async () => {
  vi.mocked(restoreDrawing).mockResolvedValue({ originalFolderGone: true })
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Restore Old sketch" }))
  await flush()

  expect(toastMock).toHaveBeenCalledWith(
    "Restored to root — its folder no longer exists",
  )
})

test("a live original folder restores silently — no root toast", async () => {
  vi.mocked(restoreDrawing).mockResolvedValue({ originalFolderGone: false })
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Restore Old sketch" }))
  await flush()

  expect(toastMock).not.toHaveBeenCalled()
  expect(toastMock.error).not.toHaveBeenCalled()
})

test("empty trash shows the quiet retention line only", () => {
  renderTrashPage({ drawings: [], folders: [] })

  expect(
    screen.getByText(
      "Nothing in trash. Deleted drawings stay here for 30 days before being removed forever.",
    ),
  ).toBeTruthy()
  // No CTA, no illustration — tier 2 (spec §5.10)
  expect(screen.queryByRole("button")).toBeNull()
})

test("the tab reads Trash · Excaliself", () => {
  renderTrashPage()

  expect(document.title).toBe("Trash · Excaliself")
})

test("loading holds the grid with the delayed skeleton, not a spinner", () => {
  vi.useFakeTimers()
  vi.mocked(getTrashItems).mockReturnValue(new Promise(() => {}))
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  render(
    <QueryClientProvider client={client}>
      <TrashPage />
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
})
