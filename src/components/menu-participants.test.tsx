import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"
import type { Participant } from "@/features/collab/protocol"
import { MenuParticipants } from "./menu-participants"

/**
 * The canvas package can't be imported under vitest, and its menu primitives
 * are chrome we don't own. These stand-ins keep the two things this component
 * decides: whether it renders at all, and what each row says and does.
 */
vi.mock("@excalidraw/excalidraw", () => ({
  MainMenu: {
    Group: ({ title, children }: { title: string; children: ReactNode }) => (
      <div>
        <h2>{title}</h2>
        {children}
      </div>
    ),
    Item: ({
      children,
      icon,
      onSelect,
    }: {
      children: ReactNode
      icon: ReactNode
      onSelect: () => void
    }) => (
      <button type="button" onClick={onSelect}>
        {icon}
        {children}
      </button>
    ),
    Separator: () => <hr />,
  },
}))

afterEach(cleanup)

const participant = (name: string, i: number): Participant => ({
  connectionId: `peer-${i}`,
  name,
  color: { background: "#fa5252", stroke: "#c92a2a" },
  isGuest: true,
})

test("a room with nobody else in it adds nothing to the menu", () => {
  const { container } = render(
    <MenuParticipants
      participants={[]}
      followedConnectionId={null}
      onFollow={() => {}}
    />,
  )
  expect(container.firstChild).toBeNull()
})

test("each person is a row that starts following them", () => {
  const onFollow = vi.fn()
  const wren = participant("Wren", 1)
  render(
    <MenuParticipants
      participants={[wren, participant("Ada Lovelace", 2)]}
      followedConnectionId={null}
      onFollow={onFollow}
    />,
  )

  expect(screen.getByText("2 other people here")).toBeTruthy()
  screen.getByRole("button", { name: "Wren" }).click()
  expect(onFollow).toHaveBeenCalledWith(wren)
})

test("the row you are following offers to stop instead", () => {
  const onFollow = vi.fn()
  const wren = participant("Wren", 1)
  render(
    <MenuParticipants
      participants={[wren]}
      followedConnectionId={wren.connectionId}
      onFollow={onFollow}
    />,
  )

  expect(screen.getByText("1 other person here")).toBeTruthy()
  screen.getByRole("button", { name: "Stop following Wren" }).click()
  expect(onFollow).toHaveBeenCalledWith(wren)
})
