import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { PasswordSection } from "./PasswordSection"

const changePassword = vi.fn()

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    changePassword: (...args: unknown[]) => changePassword(...args),
  },
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

beforeEach(async () => {
  const { toast } = await import("sonner")
  vi.mocked(toast.success).mockClear()
  vi.mocked(toast.error).mockClear()
  changePassword.mockReset().mockResolvedValue({ error: null })
})

function fillAndSubmit(current = "old-password", next = "new-password-123") {
  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: current },
  })
  fireEvent.change(screen.getByLabelText("New password"), {
    target: { value: next },
  })
  fireEvent.click(screen.getByRole("button", { name: /change password/i }))
}

test("submitting revokes other sessions and clears the form on success", async () => {
  render(<PasswordSection />)
  fillAndSubmit()
  await waitFor(() =>
    expect(changePassword).toHaveBeenCalledWith({
      currentPassword: "old-password",
      newPassword: "new-password-123",
      revokeOtherSessions: true,
    }),
  )
  const { toast } = await import("sonner")
  await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled())
  const current = screen.getByLabelText("Current password") as HTMLInputElement
  const next = screen.getByLabelText("New password") as HTMLInputElement
  expect(current.value).toBe("")
  expect(next.value).toBe("")
})

test("a too-short new password surfaces inline without hitting the server", async () => {
  render(<PasswordSection />)
  fillAndSubmit("old-password", "short")
  await screen.findByText(/at least 8 characters/i)
  expect(changePassword).not.toHaveBeenCalled()
})

test("a wrong current password shows an inline error and allows a retry", async () => {
  changePassword.mockResolvedValueOnce({
    error: { message: "Invalid password", status: 400 },
  })
  render(<PasswordSection />)
  fillAndSubmit("wrong-pass")
  await screen.findByText("Incorrect password")

  fireEvent.change(screen.getByLabelText("Current password"), {
    target: { value: "right-pass" },
  })
  fireEvent.click(screen.getByRole("button", { name: /change password/i }))
  await waitFor(() => expect(changePassword).toHaveBeenCalledTimes(2))
  const { toast } = await import("sonner")
  await waitFor(() => expect(vi.mocked(toast.success)).toHaveBeenCalled())
})

test("an unexpected server error falls back to an error toast", async () => {
  changePassword.mockResolvedValueOnce({
    error: { message: "Something exploded", status: 500 },
  })
  render(<PasswordSection />)
  fillAndSubmit()
  const { toast } = await import("sonner")
  await waitFor(() =>
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Something exploded"),
  )
})

test("the submit button shows a pending state while the change is in flight", async () => {
  let resolveChange!: () => void
  changePassword.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveChange = () => resolve({ error: null })
      }),
  )
  render(<PasswordSection />)
  fillAndSubmit()
  await screen.findByRole("button", { name: /changing/i })
  resolveChange()
  await screen.findByRole("button", { name: /change password/i })
})
