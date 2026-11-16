import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { FooterRightPortal } from "./excalidraw-portal"

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

// Stands in for Excalidraw's UI; `mount` adds a fresh copy, like a layout switch.
function mountExcalidrawUi() {
  document.querySelector(".excalidraw")?.remove()
  const root = document.createElement("div")
  root.className = "excalidraw"
  root.innerHTML = `<div class="layer-ui__wrapper__footer-right"></div>`
  document.body.append(root)
  return root
}

const renderPortal = () =>
  render(
    <FooterRightPortal>
      <span>Saved</span>
    </FooterRightPortal>,
  )

test("the portal renders once Excalidraw mounts its footer", async () => {
  renderPortal()
  expect(screen.queryByText("Saved")).toBeNull()

  mountExcalidrawUi()

  await waitFor(() =>
    expect(
      screen.getByText("Saved").closest(".layer-ui__wrapper__footer-right"),
    ).not.toBeNull(),
  )
})

test("the portal follows Excalidraw when it re-creates its UI", async () => {
  mountExcalidrawUi()
  renderPortal()
  await waitFor(() => expect(screen.getByText("Saved").isConnected).toBe(true))

  const next = mountExcalidrawUi()

  await waitFor(() =>
    expect(next.contains(screen.getByText("Saved"))).toBe(true),
  )
})
