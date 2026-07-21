import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"

const { navigateMock, loaderState } = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  loaderState: {
    data: null as { reset: { email: string } | null } | null,
  },
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useSearch: () => ({ token: "tok-123" }),
    useLoaderData: () => loaderState.data,
  }),
  useNavigate: () => navigateMock,
  Link: ({ to, children }: { to: string; children: ReactNode }) => (
    <a href={to}>{children}</a>
  ),
}))

vi.mock("@/features/password-resets/server", () => ({
  validatePasswordReset: vi.fn(),
  resetPasswordWithToken: vi.fn(),
}))

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
beforeEach(() => {
  navigateMock.mockReset()
})

async function renderResetPassword(reset: { email: string } | null) {
  loaderState.data = { reset }
  const { Route } = await import("./reset-password")
  const ResetPasswordPage = (
    Route as unknown as { options: { component: React.ComponentType } }
  ).options.component
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ResetPasswordPage />
    </QueryClientProvider>,
  )
}

test("a live link shows the set-new-password form addressed to the account", async () => {
  await renderResetPassword({ email: "ada@example.com" })
  expect(
    screen.getByRole("heading", { name: "Set a new password" }),
  ).toBeDefined()
  expect(screen.getByText(/ada@example\.com/)).toBeDefined()
  expect(screen.getByLabelText(/new password/i)).toBeDefined()
  expect(screen.getByLabelText(/confirm password/i)).toBeDefined()
  expect(screen.getByRole("button", { name: "Set password" })).toBeDefined()
})

test("dead link explains itself and offers Go to sign in — no form", async () => {
  await renderResetPassword(null)
  expect(
    screen.getByText(
      "This reset link has expired or was already used. Ask an admin to generate a new one.",
    ),
  ).toBeDefined()
  const goToSignIn = screen.getByRole("link", { name: "Go to sign in" })
  expect(goToSignIn.getAttribute("href")).toBe("/login")
  // The password form must not render on a dead link.
  expect(screen.queryByLabelText(/new password/i)).toBeNull()
  expect(screen.queryByRole("button", { name: "Set password" })).toBeNull()
})

test("mismatched passwords stay on the form with an inline error", async () => {
  const { resetPasswordWithToken } = await import(
    "@/features/password-resets/server"
  )
  await renderResetPassword({ email: "ada@example.com" })
  fireEvent.change(screen.getByLabelText(/new password/i), {
    target: { value: "password123" },
  })
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: "password456" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Set password" }))

  await waitFor(() => {
    expect(screen.getByText("Passwords do not match")).toBeDefined()
  })
  expect(resetPasswordWithToken).not.toHaveBeenCalled()
})

test("submitting sets the password and lands in the app, not the login page", async () => {
  const { resetPasswordWithToken } = await import(
    "@/features/password-resets/server"
  )
  vi.mocked(resetPasswordWithToken).mockResolvedValue(undefined)

  await renderResetPassword({ email: "ada@example.com" })
  fireEvent.change(screen.getByLabelText(/new password/i), {
    target: { value: "password123" },
  })
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: "password123" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Set password" }))

  await waitFor(() => {
    expect(resetPasswordWithToken).toHaveBeenCalledWith(
      { data: { token: "tok-123", password: "password123" } },
      // react-query passes its mutation context as a second argument.
      expect.anything(),
    )
  })
  await waitFor(() => {
    expect(navigateMock).toHaveBeenCalledWith({ to: "/" })
  })
  expect(navigateMock).not.toHaveBeenCalledWith({ to: "/login" })
})

test("loader validates the token instead of redirecting", async () => {
  const { validatePasswordReset } = await import(
    "@/features/password-resets/server"
  )
  vi.mocked(validatePasswordReset).mockResolvedValue({
    email: "ada@example.com",
  })
  const { Route } = await import("./reset-password")
  const loader = (
    Route as unknown as {
      options: {
        loader: (ctx: {
          deps: { token: string }
        }) => Promise<{ reset: unknown }>
      }
    }
  ).options.loader

  // A present token is validated server-side.
  await expect(loader({ deps: { token: "tok-123" } })).resolves.toEqual({
    reset: { email: "ada@example.com" },
  })

  // A missing token renders the dead-link state without a server call.
  vi.mocked(validatePasswordReset).mockClear()
  await expect(loader({ deps: { token: "" } })).resolves.toEqual({
    reset: null,
  })
  expect(validatePasswordReset).not.toHaveBeenCalled()
})
