import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { TreeRowActions } from "./TreeRowActions"

// Auto-cleanup needs vitest globals, which this repo leaves off; without it
// Radix portals from the previous test linger in document.body.
afterEach(cleanup)

// Mirrors FolderItem's structure: the row div (containing the actions) is the
// CollapsibleTrigger, and the actions' dropdown/dialog render through portals
// that are React children of that trigger — so their clicks bubble to it
// through the React tree unless stopped.
function renderRow(onOpenChange: (open: boolean) => void) {
  render(
    <Collapsible open onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <div>
          <span>Row label</span>
          <TreeRowActions
            isRenaming={false}
            onStartRename={vi.fn()}
            onMenuCloseAutoFocus={vi.fn()}
            onDelete={vi.fn()}
            deleteTitle="Delete folder?"
            deleteDescription="Delete?"
          />
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>children</CollapsibleContent>
    </Collapsible>,
  )
}

function openDropdown() {
  const trigger = document.querySelector('[data-sidebar="menu-action"]')
  if (!(trigger instanceof HTMLElement)) throw new Error("trigger not found")
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
}

function openDeleteDialog() {
  openDropdown()
  const deleteItem = screen.getByRole("menuitem", { name: /delete/i })
  fireEvent.click(deleteItem)
  return screen.getByRole("alertdialog")
}

test("clicking Delete in the dropdown does not toggle the collapsible row", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  openDeleteDialog()
  expect(onOpenChange).not.toHaveBeenCalled()
})

test("clicking the dialog's confirm button does not toggle the collapsible row", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  openDeleteDialog()
  fireEvent.click(screen.getByRole("button", { name: "Delete" }))
  expect(onOpenChange).not.toHaveBeenCalled()
})

test("clicking the dialog's cancel button does not toggle the collapsible row", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  openDeleteDialog()
  fireEvent.click(screen.getByRole("button", { name: /cancel/i }))
  expect(onOpenChange).not.toHaveBeenCalled()
})

test("clicking the dialog overlay does not toggle the collapsible row", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  openDeleteDialog()
  const overlay = document.querySelector('[data-slot="alert-dialog-overlay"]')
  if (!(overlay instanceof HTMLElement)) throw new Error("overlay not found")
  fireEvent.click(overlay)
  expect(onOpenChange).not.toHaveBeenCalled()
})

test("clicking the row itself still toggles the collapsible", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  fireEvent.click(screen.getByText("Row label"))
  expect(onOpenChange).toHaveBeenCalledWith(false)
})
