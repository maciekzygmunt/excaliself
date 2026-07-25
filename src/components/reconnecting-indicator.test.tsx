import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { ReconnectingIndicator } from "./reconnecting-indicator"

afterEach(cleanup)

test("a connected room shows nothing at all", () => {
  const { container } = render(<ReconnectingIndicator status="connected" />)
  expect(container.firstChild).toBeNull()
})

test("the first dial shows nothing either — the page has its own loader", () => {
  const { container } = render(<ReconnectingIndicator status="connecting" />)
  expect(container.firstChild).toBeNull()
})

test("a dropped connection says so, quietly", () => {
  render(<ReconnectingIndicator status="reconnecting" />)

  const indicator = screen.getByRole("status")
  expect(indicator.textContent).toBe("Reconnecting…")
  // No button, and nothing about lost work: the reconnect is automatic and
  // indefinite, and the edits made meanwhile merge on rejoin (spec §5.3).
  expect(screen.queryByRole("button")).toBeNull()
})
