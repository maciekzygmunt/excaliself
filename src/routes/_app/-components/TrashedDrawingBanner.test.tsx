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
import { getDrawings, restoreDrawing } from "@/features/drawings/server"
import { getFolders } from "@/features/folders/server"
import type { TrashItems } from "@/features/trash/queries"
import { trashQueryOptions } from "@/features/trash/queries"
import { deleteTrashUnitForever, getTrashItems } from "@/features/trash/server"
import { CommandPaletteProvider } from "./CommandPalette"
import { TrashedDrawingBanner } from "./TrashedDrawingBanner"

const { toastMock, navigateMock } = vi.hoisted(() => ({
  toastMock: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
  navigateMock: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
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

// The palette provider (needed for the banner's context section) pulls in
// the create dialog and the auth client — stub those edges.
vi.mock("./CreateDialog", () => ({
  useCreateDialog: () => ({
    openCreateDrawingDialog: vi.fn(),
    openCreateFolderDialog: vi.fn(),
  }),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut: vi.fn() },
}))

beforeEach(() => {
  vi.clearAllMocks()
  // The palette inside the provider queries these on mount
  vi.mocked(getDrawings).mockResolvedValue([])
  vi.mocked(getFolders).mockResolvedValue([])
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
})

const DAY_MS = 24 * 60 * 60 * 1000
const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS)

const soloDrawing = {
  id: "d1",
  name: "Old sketch",
  deletedAt: daysAgo(5),
  trashRootId: "d1",
}

function renderBanner(
  drawing: typeof soloDrawing = soloDrawing,
  trashItems?: TrashItems,
) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  if (trashItems) {
    client.setQueryData(trashQueryOptions().queryKey, trashItems)
  }
  const view = render(
    <QueryClientProvider client={client}>
      <CommandPaletteProvider>
        <TrashedDrawingBanner drawing={drawing} />
      </CommandPaletteProvider>
    </QueryClientProvider>,
  )
  return { ...view, client }
}

const openPalette = () => {
  fireEvent.keyDown(window, { key: "k", metaKey: true })
}

const flush = () => act(async () => {})

test("states the days-until-purge count with Restore and Delete forever", () => {
  renderBanner()

  expect(
    screen.getByText(/This drawing will be permanently deleted in 25 days\./),
  ).toBeTruthy()
  expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Delete forever" })).toBeTruthy()
})

test("countdown copy collapses at the boundaries", () => {
  const { unmount } = renderBanner({
    ...soloDrawing,
    deletedAt: daysAgo(29.5),
  })
  expect(screen.getByText(/permanently deleted in 1 day\./)).toBeTruthy()
  unmount()

  renderBanner({ ...soloDrawing, deletedAt: daysAgo(31) })
  expect(screen.getByText(/permanently deleted today\./)).toBeTruthy()
})

test("Restore calls the standard restore path", async () => {
  vi.mocked(restoreDrawing).mockResolvedValue({ originalFolderGone: false })
  renderBanner()

  fireEvent.click(screen.getByRole("button", { name: "Restore" }))
  await flush()

  expect(restoreDrawing).toHaveBeenCalledWith({ data: "d1" }, expect.anything())
})

test("a restore landing at root surfaces the fallback toast", async () => {
  vi.mocked(restoreDrawing).mockResolvedValue({ originalFolderGone: true })
  renderBanner()

  fireEvent.click(screen.getByRole("button", { name: "Restore" }))
  await flush()

  expect(toastMock).toHaveBeenCalledWith(
    "Restored to root — its folder no longer exists",
  )
})

test("Delete forever confirms via the danger dialog, then navigates Home", async () => {
  vi.mocked(deleteTrashUnitForever).mockResolvedValue(undefined)
  renderBanner()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  expect(
    screen.getByText(
      '"Old sketch" will be permanently deleted. This can\'t be undone.',
    ),
  ).toBeTruthy()
  // Nothing destroyed, nowhere navigated, until the confirm
  expect(deleteTrashUnitForever).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(deleteTrashUnitForever).toHaveBeenCalledWith(
    { data: "d1" },
    expect.anything(),
  )
  await waitFor(() =>
    expect(navigateMock).toHaveBeenCalledWith({ to: "/draw", replace: true }),
  )
})

test("cancelling the danger dialog destroys nothing and stays put", async () => {
  renderBanner()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await flush()

  expect(deleteTrashUnitForever).not.toHaveBeenCalled()
  expect(navigateMock).not.toHaveBeenCalled()
})

test("a failed delete keeps the dialog open with an error toast, no navigation", async () => {
  vi.mocked(deleteTrashUnitForever).mockRejectedValue(new Error("boom"))
  renderBanner()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(toastMock.error).toHaveBeenCalledWith(
    "Couldn't delete — nothing was removed",
  )
  expect(navigateMock).not.toHaveBeenCalled()
  // Dialog still open for retry or cancel
  expect(screen.getByRole("button", { name: "Delete forever" })).toBeTruthy()
})

test("confirm stays disabled while the folder unit's counts are loading", async () => {
  const trashItems: TrashItems = {
    drawings: [],
    folders: [
      {
        id: "f1",
        name: "Archive",
        space: "private",
        createdBy: "user-1",
        deletedBy: null,
        deletedByName: null,
        parentId: null,
        deletedAt: daysAgo(5),
        trashRootId: "f1",
        itemCount: 3,
        drawingCount: 2,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    totals: { drawings: 2, folders: 1 },
  }
  let resolveTrash!: (items: TrashItems) => void
  vi.mocked(getTrashItems).mockReturnValue(
    new Promise((resolve) => {
      resolveTrash = resolve
    }),
  )
  // No seeded cache — the counts fetch is genuinely in flight.
  renderBanner({ ...soloDrawing, trashRootId: "f1" })

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  const confirm = screen.getByRole("button", {
    name: "Delete forever",
  }) as HTMLButtonElement
  // A quick click can't outrun the counts fetch (spec §4.5: count-aware).
  expect(confirm.disabled).toBe(true)
  fireEvent.click(confirm)
  expect(deleteTrashUnitForever).not.toHaveBeenCalled()

  resolveTrash(trashItems)
  await waitFor(() => expect(confirm.disabled).toBe(false))
  expect(
    screen.getByText(
      'This drawing was trashed with its folder. "Archive" and the 2 drawings and 1 folder inside will be permanently deleted. This can\'t be undone.',
    ),
  ).toBeTruthy()
})

test("the palette shows a This drawing section with Restore and Delete forever", () => {
  renderBanner()
  openPalette()

  expect(screen.getByText("This drawing")).toBeTruthy()
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Restore",
    "Delete forever",
    "Home",
    "All drawings",
    "Trash",
    "Settings",
    "New drawing",
    "New folder",
    "Sign out",
  ])
})

test("the palette Restore row restores via the standard path", async () => {
  vi.mocked(restoreDrawing).mockResolvedValue({ originalFolderGone: false })
  renderBanner()
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Restore" }))
  await flush()

  expect(restoreDrawing).toHaveBeenCalledWith({ data: "d1" }, expect.anything())
  // Selecting closed the palette; the canvas flip comes from invalidation
  expect(screen.queryByRole("combobox")).toBeNull()
})

test("the palette Delete forever row closes into the danger dialog, then navigates Home on confirm", async () => {
  vi.mocked(deleteTrashUnitForever).mockResolvedValue(undefined)
  renderBanner()
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Delete forever" }))
  await flush()

  // Palette closed into the same count-aware dialog the banner button opens
  expect(screen.queryByRole("combobox")).toBeNull()
  expect(
    screen.getByText(
      '"Old sketch" will be permanently deleted. This can\'t be undone.',
    ),
  ).toBeTruthy()
  expect(deleteTrashUnitForever).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(deleteTrashUnitForever).toHaveBeenCalledWith(
    { data: "d1" },
    expect.anything(),
  )
  await waitFor(() =>
    expect(navigateMock).toHaveBeenCalledWith({ to: "/draw", replace: true }),
  )
})

test("a drawing trashed with its folder deletes the whole unit, with count-aware copy", async () => {
  vi.mocked(deleteTrashUnitForever).mockResolvedValue(undefined)
  const trashItems: TrashItems = {
    drawings: [],
    folders: [
      {
        id: "f1",
        name: "Archive",
        space: "private",
        createdBy: "user-1",
        deletedBy: null,
        deletedByName: null,
        parentId: null,
        deletedAt: daysAgo(5),
        trashRootId: "f1",
        itemCount: 3,
        drawingCount: 2,
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date("2026-01-01T00:00:00Z"),
      },
    ],
    totals: { drawings: 2, folders: 1 },
  }
  vi.mocked(getTrashItems).mockResolvedValue(trashItems)
  renderBanner({ ...soloDrawing, trashRootId: "f1" }, trashItems)

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  expect(
    screen.getByText(
      'This drawing was trashed with its folder. "Archive" and the 2 drawings and 1 folder inside will be permanently deleted. This can\'t be undone.',
    ),
  ).toBeTruthy()

  fireEvent.click(screen.getByRole("button", { name: "Delete forever" }))
  await flush()

  expect(deleteTrashUnitForever).toHaveBeenCalledWith(
    { data: "f1" },
    expect.anything(),
  )
})
