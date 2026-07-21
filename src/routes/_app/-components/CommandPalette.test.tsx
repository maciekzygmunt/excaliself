import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { Pencil, Star, Trash2 } from "lucide-react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  CommandPalette,
  CommandPaletteProvider,
  type PaletteContextSection,
  usePaletteContextSection,
} from "./CommandPalette"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

const onOpenChange = vi.fn()

beforeEach(() => {
  navigate.mockClear()
  onOpenChange.mockClear()
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderOpenPalette() {
  render(<CommandPalette open onOpenChange={onOpenChange} />)
  return screen.getByRole("combobox")
}

test("shows exactly the four Go to rows", () => {
  renderOpenPalette()
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual([
    "Home",
    "All drawings",
    "Trash",
    "Settings",
  ])
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
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual(["Settings"])
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

const onRename = vi.fn()
const onStar = vi.fn()
const onTrash = vi.fn()

function makeSection(): PaletteContextSection {
  return {
    title: "This drawing",
    rows: [
      {
        id: "drawing:rename",
        label: "Rename",
        icon: Pencil,
        onSelect: onRename,
      },
      { id: "drawing:star", label: "Star", icon: Star, onSelect: onStar },
      {
        id: "drawing:trash",
        label: "Move to trash",
        icon: Trash2,
        destructive: true,
        onSelect: onTrash,
      },
    ],
  }
}

function renderWithContextSection() {
  render(
    <CommandPalette
      open
      onOpenChange={onOpenChange}
      contextSection={makeSection()}
    />,
  )
  return screen.getByRole("combobox")
}

test("the context section renders above Go to", () => {
  renderWithContextSection()
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual([
    "Rename",
    "Star",
    "Move to trash",
    "Home",
    "All drawings",
    "Trash",
    "Settings",
  ])
  expect(screen.getByText("This drawing")).toBeDefined()
})

test("selecting a context row runs its action and closes the palette", () => {
  renderWithContextSection()
  fireEvent.click(screen.getByRole("option", { name: "Rename" }))
  expect(onRename).toHaveBeenCalled()
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(navigate).not.toHaveBeenCalled()
})

test("Enter lands on the first context row, not a Go to row", () => {
  const input = renderWithContextSection()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(onRename).toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})

test("typing filters within sections and collapses empty ones", () => {
  const input = renderWithContextSection()
  fireEvent.change(input, { target: { value: "star" } })
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Star",
  ])
  expect(screen.queryByText("Go to")).toBeNull()

  fireEvent.change(input, { target: { value: "trash" } })
  // Matches in both sections keep the fixed section order
  expect(screen.getAllByRole("option").map((r) => r.textContent)).toEqual([
    "Move to trash",
    "Trash",
  ])
})

function RegisteringChild({ section }: { section: PaletteContextSection }) {
  usePaletteContextSection(section)
  return null
}

test("a route-registered section appears and unregisters on unmount", () => {
  const section = makeSection()
  const { rerender } = render(
    <CommandPaletteProvider>
      <RegisteringChild section={section} />
    </CommandPaletteProvider>,
  )
  fireEvent.keyDown(window, { key: "k", metaKey: true })
  expect(screen.getAllByRole("option")).toHaveLength(7)

  rerender(<CommandPaletteProvider>{null}</CommandPaletteProvider>)
  expect(screen.getAllByRole("option")).toHaveLength(4)
  expect(screen.queryByText("This drawing")).toBeNull()
})

test("Cmd+K on the provider opens the palette", () => {
  render(
    <CommandPaletteProvider>
      <div />
    </CommandPaletteProvider>,
  )
  expect(screen.queryByRole("combobox")).toBeNull()
  fireEvent.keyDown(window, { key: "k", metaKey: true })
  expect(screen.getByRole("combobox")).toBeDefined()
})
