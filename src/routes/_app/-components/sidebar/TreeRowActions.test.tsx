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
// CollapsibleTrigger, and the actions' dropdown renders through a portal
// that is a React child of that trigger — so its clicks bubble to it
// through the React tree unless stopped.
function renderRow(
  onOpenChange: (open: boolean) => void,
  onTrash: () => void = vi.fn(),
) {
  render(
    <Collapsible open onOpenChange={onOpenChange}>
      <CollapsibleTrigger render={<div />} nativeButton={false}>
        <span>Row label</span>
        <TreeRowActions
          isRenaming={false}
          onStartRename={vi.fn()}
          menuFinalFocus={vi.fn()}
          onTrash={onTrash}
        />
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

test("Move to trash fires immediately with no confirm dialog", () => {
  const onTrash = vi.fn()
  renderRow(vi.fn(), onTrash)
  openDropdown()
  fireEvent.click(screen.getByRole("menuitem", { name: /move to trash/i }))
  // Tier-1 destructive: the callback runs on click, no dialog in between
  expect(onTrash).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole("alertdialog")).toBeNull()
})

test("clicking Move to trash does not toggle the collapsible row", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  openDropdown()
  fireEvent.click(screen.getByRole("menuitem", { name: /move to trash/i }))
  expect(onOpenChange).not.toHaveBeenCalled()
})

test("clicking the row itself still toggles the collapsible", () => {
  const onOpenChange = vi.fn()
  renderRow(onOpenChange)
  fireEvent.click(screen.getByText("Row label"))
  expect(onOpenChange).toHaveBeenCalledWith(false, expect.anything())
})

function renderStarrableRow(starred: boolean, onToggleStar: () => void) {
  render(
    <TreeRowActions
      isRenaming={false}
      starred={starred}
      onToggleStar={onToggleStar}
      onStartRename={vi.fn()}
      menuFinalFocus={vi.fn()}
      onTrash={vi.fn()}
    />,
  )
}

test("an unstarred row offers Star and triggers the toggle", () => {
  const onToggleStar = vi.fn()
  renderStarrableRow(false, onToggleStar)
  openDropdown()
  expect(screen.queryByRole("menuitem", { name: "Unstar" })).toBeNull()
  fireEvent.click(screen.getByRole("menuitem", { name: "Star" }))
  expect(onToggleStar).toHaveBeenCalledTimes(1)
})

test("a starred row offers Unstar and triggers the toggle", () => {
  const onToggleStar = vi.fn()
  renderStarrableRow(true, onToggleStar)
  openDropdown()
  expect(screen.queryByRole("menuitem", { name: "Star" })).toBeNull()
  fireEvent.click(screen.getByRole("menuitem", { name: "Unstar" }))
  expect(onToggleStar).toHaveBeenCalledTimes(1)
})

test("rows without star wiring show no star menu item", () => {
  renderRow(vi.fn())
  openDropdown()
  expect(
    screen.queryByRole("menuitem", { name: /^(star|unstar)$/i }),
  ).toBeNull()
})
