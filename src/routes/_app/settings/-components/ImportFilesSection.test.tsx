import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { ImportFilesSection } from "./ImportFilesSection"

const importFiles = vi.fn()
vi.mock("@/features/drawings/import-files", () => ({
  useImportDrawingFiles: () => importFiles,
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const file = new File(["{}"], "Plan.excalidraw")
const zone = () => screen.getByLabelText("Drop files here, or click to choose")

test("dropped files import into the root of Private", () => {
  render(<ImportFilesSection />)
  const dataTransfer = { types: ["Files"], files: [file], dropEffect: "" }

  // Cancelled: the browser shows a copy drop here.
  expect(fireEvent.dragOver(zone(), { dataTransfer })).toBe(false)
  fireEvent.drop(zone(), { dataTransfer })

  expect(importFiles).toHaveBeenCalledWith([file], {
    folderId: null,
    space: "private",
  })
})

test("chosen files import into the root of Private", () => {
  render(<ImportFilesSection />)
  fireEvent.change(zone(), { target: { files: [file] } })

  expect(importFiles).toHaveBeenCalledWith([file], {
    folderId: null,
    space: "private",
  })
})
