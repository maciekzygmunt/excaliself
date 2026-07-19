import { cleanup, render } from "@testing-library/react"
import { afterEach, expect, test } from "vitest"
import { Button } from "./button"

afterEach(cleanup)

function renderButton(props?: React.ComponentProps<typeof Button>) {
  const { container } = render(<Button {...props}>Click me</Button>)
  const button = container.querySelector('[data-slot="button"]')
  if (!(button instanceof HTMLElement)) throw new Error("button not found")
  return button
}

const variants = [
  "default",
  "destructive",
  "outline",
  "secondary",
  "ghost",
] as const

for (const variant of variants) {
  test(`${variant} variant compresses to 0.98 while pressed`, () => {
    const button = renderButton({ variant })
    expect(button.className).toContain("active:scale-[0.98]")
  })
}

test("press feedback rides the existing transition", () => {
  const button = renderButton()
  expect(button.className).toContain("transition-all")
})

test("disabled buttons block pointer interaction, so pointer presses give no feedback", () => {
  const button = renderButton({ disabled: true })
  expect(button.className).toContain("disabled:pointer-events-none")
})
