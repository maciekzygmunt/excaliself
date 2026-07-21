import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { CommandPalette, CommandPaletteProvider } from "./CommandPalette"

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
