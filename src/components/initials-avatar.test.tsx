import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { userInitials } from "@/features/account/display-name"
import { InitialsAvatar } from "./initials-avatar"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

test("initials come from the first two words of the display name", () => {
  expect(userInitials({ name: "John Doe", email: "j@example.com" })).toBe("JD")
  expect(
    userInitials({ name: "Anna Maria Nowak", email: "a@example.com" }),
  ).toBe("AM")
})

test("a single-word name yields one initial", () => {
  expect(userInitials({ name: "john", email: "j@example.com" })).toBe("J")
})

test("falls back to the email's first letter when no name is set", () => {
  expect(userInitials({ name: null, email: "maciek@example.com" })).toBe("M")
  expect(userInitials({ name: "", email: "maciek@example.com" })).toBe("M")
  expect(userInitials({ name: "   ", email: "maciek@example.com" })).toBe("M")
})

test("renders the initials, hidden from assistive tech", () => {
  render(<InitialsAvatar name="John Doe" email="j@example.com" />)
  const avatar = screen.getByText("JD")
  expect(avatar.getAttribute("aria-hidden")).toBe("true")
})

test("merges a size override onto the base classes", () => {
  render(
    <InitialsAvatar name={null} email="m@example.com" className="h-7 w-7" />,
  )
  const avatar = screen.getByText("M")
  expect(avatar.classList).toContain("h-7")
  expect(avatar.classList).toContain("rounded-full")
})
