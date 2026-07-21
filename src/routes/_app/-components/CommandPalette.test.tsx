import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { Drawing } from "@/features/drawings/queries"
import { drawingsQueryOptions } from "@/features/drawings/queries"
import type { Folder } from "@/features/folders/queries"
import { foldersQueryOptions } from "@/features/folders/queries"
import { CommandPalette, CommandPaletteProvider } from "./CommandPalette"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
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

const onOpenChange = vi.fn()

beforeEach(() => {
  navigate.mockClear()
  onOpenChange.mockClear()
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
    starred: false,
    deletedAt: null,
    trashRootId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function makeFolder(overrides: Partial<Folder> & { id: string }): Folder {
  return {
    name: `Folder ${overrides.id}`,
    ownerId: "user-1",
    parentId: null,
    deletedAt: null,
    trashRootId: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  }
}

function renderPalette({
  drawings = [],
  folders = [],
  provider = false,
}: {
  drawings?: Drawing[]
  folders?: Folder[]
  provider?: boolean
} = {}) {
  // Seeded data is the fixture — keep react-query from refetching it through
  // the stubbed server functions.
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(drawingsQueryOptions().queryKey, drawings)
  client.setQueryData(foldersQueryOptions().queryKey, folders)
  render(
    <QueryClientProvider client={client}>
      {provider ? (
        <CommandPaletteProvider>
          <div />
        </CommandPaletteProvider>
      ) : (
        <CommandPalette open onOpenChange={onOpenChange} />
      )}
    </QueryClientProvider>,
  )
}

function renderOpenPalette(
  fixtures: { drawings?: Drawing[]; folders?: Folder[] } = {},
) {
  renderPalette(fixtures)
  return screen.getByRole("combobox")
}

function optionLabels() {
  return screen.getAllByRole("option").map((r) => r.textContent)
}

test("empty input shows exactly the four Go to rows — no drawings or folders", () => {
  renderOpenPalette({
    drawings: [makeDrawing({ id: "d1", name: "Homework" })],
    folders: [makeFolder({ id: "f1", name: "Homes" })],
  })
  expect(optionLabels()).toEqual(["Home", "All drawings", "Trash", "Settings"])
  expect(screen.queryByText("Drawings")).toBeNull()
})

test("Enter selects the first row, navigates and closes", () => {
  const input = renderOpenPalette()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(navigate).toHaveBeenCalledWith({ to: "/draw" })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("arrow keys move the active row before Enter", () => {
  const input = renderOpenPalette()
  fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "ArrowUp" })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(navigate).toHaveBeenCalledWith({ to: "/drawings" })
})

test("clicking a row navigates and closes", () => {
  renderOpenPalette()
  fireEvent.click(screen.getByRole("option", { name: "Trash" }))
  expect(navigate).toHaveBeenCalledWith({ to: "/trash" })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("typing filters within the Go to section", () => {
  const input = renderOpenPalette()
  fireEvent.change(input, { target: { value: "set" } })
  expect(optionLabels()).toEqual(["Settings"])
  fireEvent.keyDown(input, { key: "Enter" })
  expect(navigate).toHaveBeenCalledWith({ to: "/settings" })
})

test("a query with no matches shows the empty state", () => {
  const input = renderOpenPalette()
  fireEvent.change(input, { target: { value: "zzz" } })
  expect(screen.queryAllByRole("option")).toHaveLength(0)
  expect(screen.getByText("No results")).toBeDefined()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(navigate).not.toHaveBeenCalled()
})

test("typing lists matching drawings under Drawings, above Go to — never interleaved", () => {
  const input = renderOpenPalette({
    drawings: [
      makeDrawing({ id: "d1", name: "Settings sketch" }),
      makeDrawing({ id: "d2", name: "Roadmap" }),
    ],
  })
  fireEvent.change(input, { target: { value: "set" } })
  // The drawing matches "set" too, but stays in its own section above Go to
  expect(optionLabels()).toEqual(["Settings sketch", "Settings"])
  expect(screen.getByText("Drawings")).toBeDefined()
  expect(screen.getByText("Go to")).toBeDefined()
})

test("selecting a drawing opens it and closes the palette", () => {
  const input = renderOpenPalette({
    drawings: [makeDrawing({ id: "d1", name: "Roadmap" })],
  })
  fireEvent.change(input, { target: { value: "road" } })
  fireEvent.click(screen.getByRole("option", { name: "Roadmap" }))
  expect(navigate).toHaveBeenCalledWith({
    to: "/draw/$id",
    params: { id: "d1" },
  })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("arrow keys walk across section boundaries", () => {
  const input = renderOpenPalette({
    drawings: [makeDrawing({ id: "d1", name: "Settings sketch" })],
  })
  fireEvent.change(input, { target: { value: "set" } })
  fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(navigate).toHaveBeenCalledWith({ to: "/settings" })
})

test("trashed drawings never appear, even if a stale cache holds one", () => {
  const input = renderOpenPalette({
    drawings: [
      makeDrawing({ id: "d1", name: "Roadmap" }),
      makeDrawing({
        id: "d2",
        name: "Roadmap old",
        deletedAt: new Date("2026-06-01T00:00:00Z"),
      }),
    ],
  })
  fireEvent.change(input, { target: { value: "roadmap" } })
  expect(optionLabels()).toEqual(["Roadmap"])
})

test("a folder-name match surfaces as a dynamic Go to row that navigates to the folder", () => {
  const input = renderOpenPalette({
    folders: [makeFolder({ id: "f1", name: "Sprint plans" })],
  })
  fireEvent.change(input, { target: { value: "sprint" } })
  expect(screen.getByText("Go to")).toBeDefined()
  fireEvent.click(screen.getByRole("option", { name: "Sprint plans" }))
  expect(navigate).toHaveBeenCalledWith({
    to: "/folder/$id",
    params: { id: "f1" },
  })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("folder matches follow the static Go to rows within the section", () => {
  const input = renderOpenPalette({
    folders: [makeFolder({ id: "f1", name: "Trash talk" })],
  })
  fireEvent.change(input, { target: { value: "tra" } })
  expect(optionLabels()).toEqual(["Trash", "Trash talk"])
})

test("sections with no matches collapse entirely", () => {
  const input = renderOpenPalette({
    drawings: [makeDrawing({ id: "d1", name: "Roadmap" })],
  })
  fireEvent.change(input, { target: { value: "road" } })
  expect(optionLabels()).toEqual(["Roadmap"])
  expect(screen.queryByText("Go to")).toBeNull()
})

test("Cmd+K on the provider opens the palette", () => {
  renderPalette({ provider: true })
  expect(screen.queryByRole("combobox")).toBeNull()
  fireEvent.keyDown(window, { key: "k", metaKey: true })
  expect(screen.getByRole("combobox")).toBeDefined()
})
