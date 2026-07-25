import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { GuestNamePill } from "./GuestNamePill"

afterEach(cleanup)

const COLOR = { background: "#12b886", stroke: "#087f5b" }

function typeInto(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } })
}

test("the pill shows the name this visitor goes by", () => {
  render(
    <GuestNamePill name="Quiet Otter" color={COLOR} onNameChange={() => {}} />,
  )
  expect(screen.getByLabelText<HTMLInputElement>("Your name").value).toBe(
    "Quiet Otter",
  )
})

test("the dot wears the color this visitor's cursor has in the room", () => {
  render(
    <GuestNamePill name="Quiet Otter" color={COLOR} onNameChange={() => {}} />,
  )
  expect(screen.getByTestId("guest-color-dot").style.backgroundColor).toBe(
    "rgb(18, 184, 134)",
  )
})

test("typing reaches peers without waiting for a blur", () => {
  vi.useFakeTimers()
  try {
    const onNameChange = vi.fn()
    render(
      <GuestNamePill
        name="Quiet Otter"
        color={COLOR}
        onNameChange={onNameChange}
      />,
    )

    typeInto(screen.getByLabelText("Your name"), "Ada")
    expect(onNameChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onNameChange).toHaveBeenCalledWith("Ada")
  } finally {
    vi.useRealTimers()
  }
})

test("a name deleted mid-debounce never lands", () => {
  vi.useFakeTimers()
  try {
    const onNameChange = vi.fn()
    render(
      <GuestNamePill
        name="Quiet Otter"
        color={COLOR}
        onNameChange={onNameChange}
      />,
    )

    // Half a name, then second thoughts before the debounce fires. Without
    // the cancel, "Ada" would reach peers and storage 400ms after it was
    // deleted — and stay there if the tab closed before any blur.
    const input = screen.getByLabelText("Your name")
    typeInto(input, "Ada")
    act(() => {
      vi.advanceTimersByTime(100)
    })
    typeInto(input, "")
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onNameChange).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test("blurring commits the typed name straight away, trimmed", () => {
  const onNameChange = vi.fn()
  render(
    <GuestNamePill
      name="Quiet Otter"
      color={COLOR}
      onNameChange={onNameChange}
    />,
  )

  const input = screen.getByLabelText<HTMLInputElement>("Your name")
  typeInto(input, "  Ada Lovelace  ")
  fireEvent.blur(input)

  expect(onNameChange).toHaveBeenCalledWith("Ada Lovelace")
  expect(input.value).toBe("Ada Lovelace")
})

test("a name emptied and left is not a name — the old one stands", () => {
  vi.useFakeTimers()
  try {
    const onNameChange = vi.fn()
    render(
      <GuestNamePill
        name="Quiet Otter"
        color={COLOR}
        onNameChange={onNameChange}
      />,
    )

    const input = screen.getByLabelText<HTMLInputElement>("Your name")
    typeInto(input, "   ")
    fireEvent.blur(input)
    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(onNameChange).not.toHaveBeenCalled()
    expect(input.value).toBe("Quiet Otter")
  } finally {
    vi.useRealTimers()
  }
})

test("Escape puts back the name the edit started from, not just the field", () => {
  vi.useFakeTimers()
  try {
    const onNameChange = vi.fn()
    const { rerender } = render(
      <GuestNamePill
        name="Quiet Otter"
        color={COLOR}
        onNameChange={onNameChange}
      />,
    )

    // Typing already reached the room and this browser's storage, so the
    // room now knows "Ada" — abandoning has to walk that back.
    const input = screen.getByLabelText<HTMLInputElement>("Your name")
    fireEvent.focus(input)
    typeInto(input, "Ada")
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onNameChange).toHaveBeenCalledWith("Ada")
    rerender(
      <GuestNamePill name="Ada" color={COLOR} onNameChange={onNameChange} />,
    )

    fireEvent.keyDown(input, { key: "Escape" })
    expect(onNameChange).toHaveBeenLastCalledWith("Quiet Otter")
    expect(input.value).toBe("Quiet Otter")
  } finally {
    vi.useRealTimers()
  }
})

test("Enter ends the edit there and then", () => {
  const onNameChange = vi.fn()
  render(
    <GuestNamePill
      name="Quiet Otter"
      color={COLOR}
      onNameChange={onNameChange}
    />,
  )

  const input = screen.getByLabelText<HTMLInputElement>("Your name")
  typeInto(input, "Wren")
  fireEvent.keyDown(input, { key: "Enter" })
  fireEvent.blur(input)
  expect(onNameChange).toHaveBeenCalledWith("Wren")
})

test("a signed-in member's name comes from their session, so it is not editable", () => {
  render(
    <GuestNamePill
      name="Maciej"
      color={COLOR}
      editable={false}
      onNameChange={() => {}}
    />,
  )
  expect(screen.queryByLabelText("Your name")).toBeNull()
  expect(screen.getByText("Maciej")).toBeTruthy()
})
