import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { FooterRightPortal, TopLeftPortal } from "./excalidraw-portal"

afterEach(() => {
  cleanup()
  document.body.innerHTML = ""
})

// Stands in for Excalidraw's UI; `mount` adds a fresh copy, like a layout switch.
function mountExcalidrawUi() {
  document.querySelector(".excalidraw")?.remove()
  const root = document.createElement("div")
  root.className = "excalidraw"
  root.innerHTML = `
    <div class="App-menu_top__left"><div></div></div>
    <div class="layer-ui__wrapper__footer-right"></div>`
  document.body.append(root)
  return root
}

test("portals render once Excalidraw mounts its UI slots", async () => {
  render(
    <>
      <TopLeftPortal>
        <button type="button">Toggle</button>
      </TopLeftPortal>
      <FooterRightPortal>
        <span>Saved</span>
      </FooterRightPortal>
    </>,
  )
  expect(screen.queryByText("Toggle")).toBeNull()

  mountExcalidrawUi()

  await waitFor(() => {
    expect(
      screen.getByText("Toggle").closest(".App-menu_top__left"),
    ).not.toBeNull()
    expect(
      screen.getByText("Saved").closest(".layer-ui__wrapper__footer-right"),
    ).not.toBeNull()
  })
})

test("portals follow Excalidraw when it re-creates its UI", async () => {
  mountExcalidrawUi()
  render(
    <TopLeftPortal>
      <button type="button">Toggle</button>
    </TopLeftPortal>,
  )
  await waitFor(() => expect(screen.getByText("Toggle").isConnected).toBe(true))

  const next = mountExcalidrawUi()

  await waitFor(() =>
    expect(next.contains(screen.getByText("Toggle"))).toBe(true),
  )
})
