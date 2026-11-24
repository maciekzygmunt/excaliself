import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { FileDropZone } from "./file-drop"

const importFiles = vi.fn()
vi.mock("./import-files", () => ({
  useImportDrawingFiles: () => importFiles,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const target = { folderId: "folder-1", space: "team" } as const
const file = new File(["{}"], "Plan.excalidraw")
const files = (list: File[]) => ({ types: ["Files"], files: list })

function renderZone() {
  render(
    <FileDropZone target={target}>
      <button type="button">Child</button>
    </FileDropZone>,
  )
  const child = screen.getByRole("button")
  return { zone: child.parentElement as HTMLElement, child }
}

// jsdom's DragEvent drops relatedTarget; MouseEvent keeps it.
const dragLeave = (relatedTarget: Element | null) =>
  new MouseEvent("dragleave", { bubbles: true, relatedTarget })

const highlighted = (zone: HTMLElement) => zone.classList.contains("ring-2")

test("dropped files import into the target and clear the highlight", () => {
  const { zone } = renderZone()

  // Cancelled: the browser shows a copy drop here.
  expect(fireEvent.dragOver(zone, { dataTransfer: files([file]) })).toBe(false)
  expect(highlighted(zone)).toBe(true)
  fireEvent.drop(zone, { dataTransfer: files([file]) })

  expect(highlighted(zone)).toBe(false)
  expect(importFiles).toHaveBeenCalledWith([file], target)
})

test("drags that carry no files are left alone", () => {
  const { zone } = renderZone()
  const dataTransfer = { types: ["text/plain"], files: [] }

  expect(fireEvent.dragOver(zone, { dataTransfer })).toBe(true)
  fireEvent.drop(zone, { dataTransfer })

  expect(highlighted(zone)).toBe(false)
  expect(importFiles).not.toHaveBeenCalled()
})

test("moving onto a child keeps the highlight; leaving the zone clears it", () => {
  const { zone, child } = renderZone()
  fireEvent.dragOver(zone, { dataTransfer: files([file]) })

  fireEvent(zone, dragLeave(child))
  expect(highlighted(zone)).toBe(true)

  fireEvent(zone, dragLeave(null))
  expect(highlighted(zone)).toBe(false)
})
