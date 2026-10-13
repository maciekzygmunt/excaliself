import { cleanup, fireEvent, render } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { useBlockClearCanvasShortcut } from "./use-block-clear-canvas-shortcut"

function Harness({ onKeyDown }: { onKeyDown: () => void }) {
  useBlockClearCanvasShortcut()
  // Stands in for Excalidraw's container, which owns the shortcut.
  return (
    <div onKeyDown={onKeyDown}>
      <canvas aria-label="canvas" tabIndex={0} />
      <input aria-label="field" />
    </div>
  )
}

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

test.each([
  { key: "Backspace", metaKey: true },
  { key: "Delete", metaKey: true },
  { key: "Backspace", ctrlKey: true },
  { key: "Delete", ctrlKey: true },
])("$key with a modifier never reaches the canvas", (init) => {
  const container = vi.fn()
  const { getByLabelText } = render(<Harness onKeyDown={container} />)
  fireEvent.keyDown(getByLabelText("canvas"), init)
  expect(container).not.toHaveBeenCalled()
})

test("a plain Backspace still reaches the canvas, so selections can be deleted", () => {
  const container = vi.fn()
  const { getByLabelText } = render(<Harness onKeyDown={container} />)
  fireEvent.keyDown(getByLabelText("canvas"), { key: "Backspace" })
  expect(container).toHaveBeenCalledOnce()
})

test("text fields keep the shortcut", () => {
  const container = vi.fn()
  const { getByLabelText } = render(<Harness onKeyDown={container} />)
  fireEvent.keyDown(getByLabelText("field"), {
    key: "Backspace",
    metaKey: true,
  })
  expect(container).toHaveBeenCalledOnce()
})
