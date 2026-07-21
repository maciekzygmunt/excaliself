import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Drawing } from "@/features/drawings/queries"
import {
  setDrawingStarred,
  trashDrawing,
  updateDrawing,
} from "@/features/drawings/server"
import { CommandPaletteProvider } from "./CommandPalette"
import { DrawingPaletteContext } from "./DrawingPaletteContext"

const { navigate, toastMock } = vi.hoisted(() => ({
  navigate: vi.fn(),
  toastMock: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

vi.mock("sonner", () => ({ toast: toastMock }))

vi.mock("@/features/drawings/server", () => ({
  getDrawings: vi.fn(),
  getDrawingWithFiles: vi.fn(),
  createDrawing: vi.fn(),
  updateDrawing: vi.fn(),
  setDrawingStarred: vi.fn(),
  trashDrawing: vi.fn(),
  restoreDrawing: vi.fn(),
}))

// The palette itself queries folders and reaches the create dialog and auth
// client — stub those edges too (they import the db / network).
vi.mock("@/features/folders/server", () => ({
  getFolders: vi.fn(),
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

function makeDrawing(overrides: Partial<Drawing> = {}): Drawing {
  return {
    id: "d1",
    name: "Retro board",
    data: "{}",
    thumbnail: null,
    folderId: null,
    ownerId: "user-1",
    isPublic: false,
    starred: false,
    deletedAt: null,
    trashRootId: null,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...overrides,
  }
}

function setup(drawings: Drawing[]) {
  // Fresh-forever seeded cache: no mount refetch racing the assertions
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  })
  queryClient.setQueryData<Drawing[]>(["drawings"], drawings)
  queryClient.setQueryData(["folders"], [])
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <CommandPaletteProvider>{children}</CommandPaletteProvider>
    </QueryClientProvider>
  )
  render(<DrawingPaletteContext drawingId="d1" />, { wrapper })
  return { queryClient }
}

function openPalette() {
  fireEvent.keyDown(window, { key: "k", metaKey: true })
}

// react-query runs onMutate async (it awaits cancelQueries), so optimistic
// cache assertions need a microtask flush after the click
const flush = () => act(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

test("the palette shows a This drawing section above Go to on the canvas", () => {
  setup([makeDrawing()])
  openPalette()
  expect(screen.getByText("This drawing")).toBeDefined()
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Rename",
    "Star",
    "Move to trash",
    "Home",
    "All drawings",
    "Trash",
    "Settings",
    "New drawing",
    "New folder",
    "Sign out",
  ])
})

test("a drawing missing from the live list contributes no section", () => {
  setup([])
  openPalette()
  expect(screen.queryByText("This drawing")).toBeNull()
  expect(screen.getAllByRole("option")).toHaveLength(7)
})

test("the star row reads Unstar when starred and toggles optimistically", async () => {
  vi.mocked(setDrawingStarred).mockReturnValue(new Promise(() => {}))
  const { queryClient } = setup([makeDrawing({ starred: true })])
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Unstar" }))
  await flush()

  expect(vi.mocked(setDrawingStarred).mock.calls[0]?.[0]).toEqual({
    data: { id: "d1", starred: false },
  })
  // Cache patched before the server ever answers
  expect(queryClient.getQueryData<Drawing[]>(["drawings"])?.[0]?.starred).toBe(
    false,
  )
  // Selecting closed the palette
  expect(screen.queryByRole("combobox")).toBeNull()
})

test("Move to trash prunes the cache, shows the undo toast and lands on Home", async () => {
  vi.mocked(trashDrawing).mockReturnValue(new Promise(() => {}))
  const { queryClient } = setup([makeDrawing()])
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Move to trash" }))
  await flush()

  expect(queryClient.getQueryData<Drawing[]>(["drawings"])).toEqual([])
  expect(toastMock).toHaveBeenCalledWith(
    "Moved to trash",
    expect.objectContaining({
      action: expect.objectContaining({ label: "Undo" }),
    }),
  )
  expect(navigate).toHaveBeenCalledWith({ to: "/draw" })
})

test("Rename closes the palette into the rename dialog and saves optimistically", async () => {
  vi.mocked(updateDrawing).mockReturnValue(new Promise(() => {}))
  const { queryClient } = setup([makeDrawing()])
  openPalette()

  fireEvent.click(screen.getByRole("option", { name: "Rename" }))

  // Palette gone, rename dialog open with the current name prefilled
  expect(screen.queryByRole("combobox")).toBeNull()
  const input = screen.getByPlaceholderText<HTMLInputElement>(/drawing name/i)
  expect(input.value).toBe("Retro board")

  fireEvent.change(input, { target: { value: "Sprint retro" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await flush()

  expect(vi.mocked(updateDrawing).mock.calls[0]?.[0]).toEqual({
    data: { id: "d1", updateData: { name: "Sprint retro" } },
  })
  // Optimistic: the cache holds the new name before the server answers
  expect(queryClient.getQueryData<Drawing[]>(["drawings"])?.[0]?.name).toBe(
    "Sprint retro",
  )
})

test("renaming to the same or an empty name saves nothing", () => {
  setup([makeDrawing()])
  openPalette()
  fireEvent.click(screen.getByRole("option", { name: "Rename" }))

  const input = screen.getByPlaceholderText<HTMLInputElement>(/drawing name/i)
  fireEvent.keyDown(input, { key: "Enter" })
  expect(updateDrawing).not.toHaveBeenCalled()

  // Reopen: an all-whitespace name is a no-op too
  openPalette()
  fireEvent.click(screen.getByRole("option", { name: "Rename" }))
  fireEvent.change(input, { target: { value: "   " } })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(updateDrawing).not.toHaveBeenCalled()
})
