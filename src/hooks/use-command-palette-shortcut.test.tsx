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

// Excalidraw binds ⌘K to its hyperlink editor on the canvas container, so the
// event must never reach it — otherwise the link popup opens behind the palette.
test("the event never reaches the canvas container", () => {
  const canvasHandler = vi.fn()
  const { getByLabelText } = render(
    <>
      <Harness />
      <div aria-label="container" onKeyDown={canvasHandler}>
        <canvas aria-label="canvas" tabIndex={0} />
      </div>
    </>,
  )
  fireEvent.keyDown(getByLabelText("canvas"), { key: "k", metaKey: true })
  expect(open).toHaveBeenCalledOnce()
  expect(canvasHandler).not.toHaveBeenCalled()
})

test("a plain keydown still reaches the canvas container", () => {
  const canvasHandler = vi.fn()
  const { getByLabelText } = render(
    <>
      <Harness />
      <div aria-label="container" onKeyDown={canvasHandler}>
        <canvas aria-label="canvas" tabIndex={0} />
      </div>
    </>,
  )
  fireEvent.keyDown(getByLabelText("canvas"), { key: "v" })
  expect(canvasHandler).toHaveBeenCalledOnce()
})
