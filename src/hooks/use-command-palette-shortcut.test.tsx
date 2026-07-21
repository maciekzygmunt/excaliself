import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useCommandPaletteShortcut } from "./use-command-palette-shortcut"

const open = vi.fn()

function Harness() {
  useCommandPaletteShortcut(open)
  return <input aria-label="field" />
}

beforeEach(() => open.mockClear())

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

test("Cmd+K opens the palette", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: "k", metaKey: true })
  expect(open).toHaveBeenCalledOnce()
})

test("Ctrl+K opens the palette", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: "k", ctrlKey: true })
  expect(open).toHaveBeenCalledOnce()
})

test("a bare k does nothing", () => {
  render(<Harness />)
  fireEvent.keyDown(window, { key: "k" })
  expect(open).not.toHaveBeenCalled()
})

test("the shortcut is guarded inside inputs", () => {
  const { getByLabelText } = render(<Harness />)
  fireEvent.keyDown(getByLabelText("field"), { key: "k", metaKey: true })
  expect(open).not.toHaveBeenCalled()
})

test("the shortcut works from a non-input focus target like the canvas", () => {
  const { getByLabelText } = render(
    <>
      <Harness />
      <canvas aria-label="canvas" tabIndex={0} />
    </>,
  )
  fireEvent.keyDown(getByLabelText("canvas"), { key: "k", metaKey: true })
  expect(open).toHaveBeenCalledOnce()
})
