import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { TypeToConfirmDialog } from "./type-to-confirm-dialog"

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

const flush = () => act(async () => {})

function Harness({
  onConfirm,
  confirmDisabled,
}: {
  onConfirm: () => Promise<unknown>
  confirmDisabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open dialog
      </button>
      <TypeToConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Delete user?"
        description="This will permanently delete their 3 drawings and 1 folder."
        challenge="bea@example.com"
        confirmLabel="Delete user"
        pendingLabel="Deleting…"
        confirmDisabled={confirmDisabled}
        onConfirm={onConfirm}
      />
    </>
  )
}

const openDialog = () =>
  fireEvent.click(screen.getByRole("button", { name: "Open dialog" }))

const confirmButton = () =>
  screen.getByRole("button", { name: /Delete user|Deleting…/ })

const typeChallenge = (value: string) =>
  fireEvent.change(screen.getByRole("textbox"), { target: { value } })

test("confirm stays disabled until the exact challenge is typed", () => {
  render(<Harness onConfirm={() => Promise.resolve()} />)
  openDialog()

  expect(screen.getByText(/permanently delete their 3 drawings/)).toBeTruthy()
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)

  typeChallenge("bea@example")
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)

  typeChallenge("bea@example.com")
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(false)
})

test("confirmDisabled gates the button even with the challenge typed", () => {
  render(<Harness onConfirm={() => Promise.resolve()} confirmDisabled />)
  openDialog()

  typeChallenge("bea@example.com")
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(true)
})

test("confirming shows the pending label, locks close, then closes on resolve", async () => {
  let resolve = () => {}
  const onConfirm = vi.fn(
    () =>
      new Promise<void>((r) => {
        resolve = r
      }),
  )
  render(<Harness onConfirm={onConfirm} />)
  openDialog()
  typeChallenge("bea@example.com")
  fireEvent.click(confirmButton())

  expect(onConfirm).toHaveBeenCalledTimes(1)
  expect(screen.getByRole("button", { name: "Deleting…" })).toBeTruthy()
  expect(
    (screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)

  // Escape while pending must not close the dialog.
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
  expect(screen.queryByRole("alertdialog")).toBeTruthy()

  await act(async () => resolve())
  await flush()
  expect(screen.queryByRole("alertdialog")).toBeNull()
})

test("a rejected confirm keeps the dialog open for retry", async () => {
  const onConfirm = vi.fn(() => Promise.reject(new Error("nope")))
  render(<Harness onConfirm={onConfirm} />)
  openDialog()
  typeChallenge("bea@example.com")
  fireEvent.click(confirmButton())
  await flush()

  expect(screen.queryByRole("alertdialog")).toBeTruthy()
  expect((confirmButton() as HTMLButtonElement).disabled).toBe(false)
})

test("reopening starts with a blank challenge input", async () => {
  render(<Harness onConfirm={() => Promise.resolve()} />)
  openDialog()
  typeChallenge("bea@example.com")
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }))
  await flush()

  openDialog()
  expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("")
})
