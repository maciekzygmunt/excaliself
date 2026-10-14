import { cleanup, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { GuestAttribution } from "./GuestAttribution"

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: { redirect?: string }
    children?: ReactNode
  }) => (
    <a href={`${to}?redirect=${search?.redirect ?? ""}`} {...rest}>
      {children}
    </a>
  ),
}))

afterEach(cleanup)

test("signing in brings the visitor back to the drawing they were on", () => {
  render(<GuestAttribution token="a-share-token" />)

  expect(screen.getByText("Made with Excaliself")).toBeTruthy()
  expect(
    screen.getByRole("link", { name: "Sign in" }).getAttribute("href"),
  ).toBe("/login?redirect=/share/a-share-token")
})

test("a member who opened someone's link is offered no sign-in", () => {
  render(<GuestAttribution token="a-share-token" showSignIn={false} />)

  expect(screen.getByText("Made with Excaliself")).toBeTruthy()
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull()
})
