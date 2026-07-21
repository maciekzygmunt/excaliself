import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { CommandPalette, CommandPaletteProvider } from "./CommandPalette"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

const openCreateDrawingDialog = vi.fn()
const openCreateFolderDialog = vi.fn()
vi.mock("./CreateDialog", () => ({
  useCreateDialog: () => ({ openCreateDrawingDialog, openCreateFolderDialog }),
}))

const signOut = vi.hoisted(() => vi.fn(() => Promise.resolve()))
vi.mock("@/lib/auth-client", () => ({
  authClient: { signOut },
}))

const onOpenChange = vi.fn()

beforeEach(() => {
  navigate.mockClear()
  onOpenChange.mockClear()
  openCreateDrawingDialog.mockClear()
  openCreateFolderDialog.mockClear()
  signOut.mockClear()
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderOpenPalette() {
  render(<CommandPalette open onOpenChange={onOpenChange} />)
  return screen.getByRole("combobox")
}

test("shows the four Go to rows then the three Actions rows", () => {
  renderOpenPalette()
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual([
    "Home",
    "All drawings",
    "Trash",
    "Settings",
    "New drawing",
    "New folder",
    "Sign out",
  ])
})

test("the Actions section header renders after Go to", () => {
  renderOpenPalette()
  const headers = screen
    .getAllByText(/^(Go to|Actions)$/)
    .map((el) => el.textContent)
  expect(headers).toEqual(["Go to", "Actions"])
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

test("arrow keys cross the section boundary into Actions", () => {
  const input = renderOpenPalette()
  for (let i = 0; i < 4; i++) fireEvent.keyDown(input, { key: "ArrowDown" })
  fireEvent.keyDown(input, { key: "Enter" })
  expect(openCreateDrawingDialog).toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})

test("clicking a row navigates and closes", () => {
  renderOpenPalette()
  fireEvent.click(screen.getByRole("option", { name: "Trash" }))
  expect(navigate).toHaveBeenCalledWith({ to: "/trash" })
  expect(onOpenChange).toHaveBeenCalledWith(false)
})

test("New drawing closes the palette into the create drawing dialog", () => {
  renderOpenPalette()
  fireEvent.click(screen.getByRole("option", { name: "New drawing" }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(openCreateDrawingDialog).toHaveBeenCalledWith()
  expect(openCreateFolderDialog).not.toHaveBeenCalled()
  expect(navigate).not.toHaveBeenCalled()
})

test("New folder closes the palette into the create folder dialog", () => {
  renderOpenPalette()
  fireEvent.click(screen.getByRole("option", { name: "New folder" }))
  expect(onOpenChange).toHaveBeenCalledWith(false)
  expect(openCreateFolderDialog).toHaveBeenCalledWith()
  expect(openCreateDrawingDialog).not.toHaveBeenCalled()
})

test("Sign out ends the session and lands on the login page", async () => {
  const location = { href: "" }
  vi.stubGlobal("location", location)
  try {
    renderOpenPalette()
    fireEvent.click(screen.getByRole("option", { name: "Sign out" }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(signOut).toHaveBeenCalled()
    await vi.waitFor(() => expect(location.href).toBe("/login"))
  } finally {
    vi.unstubAllGlobals()
  }
})

test("typing filters across both sections", () => {
  const input = renderOpenPalette()
  fireEvent.change(input, { target: { value: "new" } })
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual(["New drawing", "New folder"])
  // Go to matched nothing, so its header collapses with it
  expect(screen.queryByText("Go to")).toBeNull()
  fireEvent.keyDown(input, { key: "Enter" })
  expect(openCreateDrawingDialog).toHaveBeenCalled()
})

test("typing filters within the Go to section", () => {
  const input = renderOpenPalette()
  fireEvent.change(input, { target: { value: "set" } })
  const rows = screen.getAllByRole("option")
  expect(rows.map((r) => r.textContent)).toEqual(["Settings"])
  expect(screen.queryByText("Actions")).toBeNull()
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
