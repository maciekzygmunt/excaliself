import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useSettingsShortcut } from "./use-settings-shortcut"

const navigate = vi.fn()
vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigate,
}))

function Harness() {
  useSettingsShortcut()
  return <input aria-label="field" />
}

beforeEach(() => navigate.mockClear())

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

test("Cmd+, opens /settings", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: ",", metaKey: true })
  expect(navigate).toHaveBeenCalledWith({ to: "/settings" })
})

test("Ctrl+, opens /settings", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: ",", ctrlKey: true })
  expect(navigate).toHaveBeenCalledWith({ to: "/settings" })
})

test("a bare comma does nothing", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: "," })
  expect(navigate).not.toHaveBeenCalled()
})

test("the shortcut is guarded inside inputs", () => {
  const { getByLabelText } = render(<Harness />)
  fireEvent.keyDown(getByLabelText("field"), { key: ",", metaKey: true })
  expect(navigate).not.toHaveBeenCalled()
})
