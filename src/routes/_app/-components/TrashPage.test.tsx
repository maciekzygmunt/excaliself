import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { renderPreviewSvg } from "@/components/drawing-gallery/preview"
import { getDrawings, restoreDrawing } from "@/features/drawings/server"
import { getFolders, restoreFolder } from "@/features/folders/server"
import type {
  TrashedDrawing,
  TrashedFolder,
  TrashItems,
} from "@/features/trash/queries"
import { trashQueryOptions } from "@/features/trash/queries"
import {
  deleteTrashUnitForever,
  emptyTrash,
  getTrashItems,
} from "@/features/trash/server"
import { CommandPaletteProvider } from "./CommandPalette"
import { TrashPage } from "./TrashPage"

const { toastMock, navigateMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
  navigateMock: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

// The palette provider (needed for the page's context section) pulls in the
// router, the create dialog and the auth client — stub those edges.
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
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

vi.mock("./CreateDialog", () => ({
  useCreateDialog: () => ({
    openCreateDrawingDialog: vi.fn(),
    openCreateFolderDialog: vi.fn(),
  }),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}))

// jsdom cannot rasterize Excalidraw scenes — assert cards, not pixels.
vi.mock("@/components/drawing-gallery/preview", () => ({
  renderPreviewSvg: vi.fn(),
}))

// The query/mutation modules import the server functions, which import the
// db — stub the server-function edge.
vi.mock("@/features/trash/server", () => ({
  getTrashItems: vi.fn(),
  deleteTrashUnitForever: vi.fn(),
  emptyTrash: vi.fn(),
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
  // The palette inside the provider queries these on mount
  vi.mocked(getDrawings).mockResolvedValue([])
  vi.mocked(getFolders).mockResolvedValue([])
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
    drawingCount: 0,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

// Archive holds 2 drawings + 1 subfolder; with the loose drawing that makes
// 3 drawings and 2 folders trashed in total.
const fixture: TrashItems = {
  drawings: [
    makeTrashedDrawing({ id: "d1", name: "Old sketch", deletedAt: daysAgo(5) }),
  ],
  folders: [
    makeTrashedFolder({
      id: "f1",
      name: "Archive",
      itemCount: 3,
      drawingCount: 2,
      deletedAt: daysAgo(2),
    }),
  ],
  totals: { drawings: 3, folders: 2 },
}

const EMPTY_TRASH: TrashItems = {
  drawings: [],
  folders: [],
  totals: { drawings: 0, folders: 0 },
}

function renderTrashPage(items: TrashItems = fixture) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(trashQueryOptions().queryKey, items)
  vi.mocked(getTrashItems).mockResolvedValue(items)
  const view = render(
    <QueryClientProvider client={client}>
      <CommandPaletteProvider>
        <TrashPage />
      </CommandPaletteProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

const openPalette = () => {
  fireEvent.keyDown(window, { key: "k", metaKey: true })
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

test("drawing cards link to the read-only view; folder cards don't link", () => {
  renderTrashPage()

  const links = screen.getAllByRole("link")
  expect(links.map((l) => l.getAttribute("href"))).toEqual(["/draw/d1"])
  expect(links[0].getAttribute("aria-label")).toBe("View Old sketch")
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
  renderTrashPage(EMPTY_TRASH)

  expect(
    screen.getByText(
      "Nothing in trash. Deleted drawings stay here for 30 days before being removed forever.",
    ),
  ).toBeTruthy()
  // No CTA, no illustration — tier 2 (spec §5.10)
  expect(screen.queryByRole("button")).toBeNull()
})

test("Delete forever opens a danger dialog — nothing fires without confirm", async () => {
  renderTrashPage()

  fireEvent.click(
    screen.getByRole("button", { name: "Delete forever Old sketch" }),
  )
  await flush()

  expect(
    screen.getByText(
      `"Old sketch" will be permanently deleted. This can't be undone.`,
    ),
  ).toBeTruthy()
  expect(deleteTrashUnitForever).not.toHaveBeenCalled()
})

test("the folder dialog states exact contents counts", async () => {
  renderTrashPage()

  fireEvent.click(
    screen.getByRole("button", { name: "Delete forever Archive" }),
  )
  await flush()

  expect(
    screen.getByText(
      `"Archive" and the 2 drawings and 1 folder inside will be permanently deleted. This can't be undone.`,
    ),
  ).toBeTruthy()
})

test("confirmed delete forever is pessimistic — the card stays and the button pends until the server answers", async () => {
  vi.mocked(deleteTrashUnitForever).mockReturnValue(new Promise(() => {}))
  renderTrashPage()

  fireEvent.click(
    screen.getByRole("button", { name: "Delete forever Old sketch" }),
  )
  await flush()
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(deleteTrashUnitForever).toHaveBeenCalledWith(
    { data: "d1" },
    expect.anything(),
  )
  // No optimistic removal (spec §4.3) — the card is still there…
  expect(screen.getByText("Old sketch")).toBeTruthy()
  // …and the pending state lives in the button, dialog still open
  const pending = screen.getByRole("button", {
    name: "Deleting…",
  }) as HTMLButtonElement
  expect(pending.disabled).toBe(true)
})

test("a confirmed delete removes the card once the server answers", async () => {
  vi.mocked(deleteTrashUnitForever).mockResolvedValue(undefined)
  renderTrashPage()
  // The revalidation refetch serves the post-delete state
  vi.mocked(getTrashItems).mockResolvedValue({
    ...fixture,
    drawings: [],
    totals: { drawings: 2, folders: 2 },
  })

  fireEvent.click(
    screen.getByRole("button", { name: "Delete forever Old sketch" }),
  )
  await flush()
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  await waitFor(() => expect(screen.queryByText("Old sketch")).toBeNull())
  expect(screen.getByText("Archive")).toBeTruthy()
})

test("a failed delete keeps the card and the dialog and shows an error toast", async () => {
  vi.mocked(deleteTrashUnitForever).mockRejectedValue(new Error("boom"))
  renderTrashPage()

  fireEvent.click(
    screen.getByRole("button", { name: "Delete forever Old sketch" }),
  )
  await flush()
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(toastMock.error).toHaveBeenCalledWith(
    "Couldn't delete — nothing was removed",
  )
  expect(screen.getByText("Old sketch")).toBeTruthy()
  // Dialog stays open for retry or cancel
  expect(screen.getByRole("alertdialog")).toBeTruthy()
})

test("Empty trash sits in the header behind a count-aware danger dialog", async () => {
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Empty trash" }))
  await flush()

  expect(
    screen.getByText(
      `This will permanently delete 3 drawings and 2 folders. This can't be undone.`,
    ),
  ).toBeTruthy()
  expect(emptyTrash).not.toHaveBeenCalled()
})

test("confirming Empty trash is pessimistic, then clears the page", async () => {
  vi.mocked(emptyTrash).mockReturnValue(new Promise(() => {}))
  renderTrashPage()

  fireEvent.click(screen.getByRole("button", { name: "Empty trash" }))
  await flush()
  const dialog = screen.getByRole("alertdialog")
  fireEvent.click(within(dialog).getByRole("button", { name: "Empty trash" }))
  await flush()

  expect(emptyTrash).toHaveBeenCalledTimes(1)
  // Pessimistic: everything still on screen while the server is answering
  expect(screen.getByText("Old sketch")).toBeTruthy()
  expect(screen.getByText("Archive")).toBeTruthy()
  expect(
    (
      within(dialog).getByRole("button", {
        name: "Emptying…",
      }) as HTMLButtonElement
    ).disabled,
  ).toBe(true)
})

test("a confirmed Empty trash clears the page once the server answers", async () => {
  vi.mocked(emptyTrash).mockResolvedValue(undefined)
  renderTrashPage()
  vi.mocked(getTrashItems).mockResolvedValue(EMPTY_TRASH)

  fireEvent.click(screen.getByRole("button", { name: "Empty trash" }))
  await flush()
  fireEvent.click(
    within(screen.getByRole("alertdialog")).getByRole("button", {
      name: "Empty trash",
    }),
  )
  await flush()

  await waitFor(() => expect(screen.getByText(/Nothing in trash/)).toBeTruthy())
  expect(screen.queryByRole("button", { name: "Empty trash" })).toBeNull()
})

test("the palette shows a single Empty trash context row above the globals", () => {
  renderTrashPage()
  openPalette()

  // One context row, then the globals — no drawings here (spec §5.11)
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Empty trash",
    "Home",
    "All drawings",
    "Trash",
    "Settings",
    "New drawing",
    "New folder",
    "Sign out",
  ])
})

test("when trash is empty the palette shows no context section", () => {
  renderTrashPage(EMPTY_TRASH)
  openPalette()

  expect(screen.queryByRole("option", { name: "Empty trash" })).toBeNull()
  expect(screen.getAllByRole("option")).toHaveLength(7)
})

test("the palette row closes into the count-aware dialog — nothing fires from the palette", async () => {
  vi.mocked(emptyTrash).mockResolvedValue(undefined)
  renderTrashPage()
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Empty trash" }))
  await flush()

  // Palette closed into the same tier-2 danger dialog the header uses
  expect(screen.queryByRole("combobox")).toBeNull()
  const dialog = screen.getByRole("alertdialog")
  expect(
    within(dialog).getByText(
      `This will permanently delete 3 drawings and 2 folders. This can't be undone.`,
    ),
  ).toBeTruthy()
  expect(emptyTrash).not.toHaveBeenCalled()

  fireEvent.click(within(dialog).getByRole("button", { name: "Empty trash" }))
  await flush()
  expect(emptyTrash).toHaveBeenCalledTimes(1)
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
      <CommandPaletteProvider>
        <TrashPage />
      </CommandPaletteProvider>
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
