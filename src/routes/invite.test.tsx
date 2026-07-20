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
    data: null as { invite: { inviterName: string | null } | null } | null,
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

vi.mock("@/features/invites/server", () => ({
  validateInvite: vi.fn(),
  registerWithInvite: vi.fn(),
}))

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
beforeEach(() => {
  navigateMock.mockReset()
})

async function renderInvite(invite: { inviterName: string | null } | null) {
  loaderState.data = { invite }
  const { Route } = await import("./invite")
  const InvitePage = (
    Route as unknown as { options: { component: React.ComponentType } }
  ).options.component
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <InvitePage />
    </QueryClientProvider>,
  )
}

test("valid invite personalizes the headline with the inviter's name", async () => {
  await renderInvite({ inviterName: "Maciek" })
  expect(
    screen.getByRole("heading", { name: "Maciek invited you" }),
  ).toBeDefined()
  expect(screen.getByText("Create your account")).toBeDefined()
  expect(screen.getByLabelText(/name/i)).toBeDefined()
  expect(screen.getByLabelText(/email/i)).toBeDefined()
  expect(screen.getByLabelText(/^password$/i)).toBeDefined()
  expect(screen.getByLabelText(/confirm password/i)).toBeDefined()
  expect(screen.getByRole("button", { name: "Create account" })).toBeDefined()
})

test("headline falls back gracefully when the inviter is unavailable", async () => {
  await renderInvite({ inviterName: null })
  expect(screen.getByRole("heading", { name: "You're invited" })).toBeDefined()
  expect(screen.getByText("Create your account")).toBeDefined()
})

test("dead link explains itself and offers Go to sign in — no form", async () => {
  await renderInvite(null)
  expect(
    screen.getByText(
      "This invite link has expired or was already used. Ask the person who invited you for a new link.",
    ),
  ).toBeDefined()
  const goToSignIn = screen.getByRole("link", { name: "Go to sign in" })
  expect(goToSignIn.getAttribute("href")).toBe("/login")
  // The registration form must not render on a dead link.
  expect(screen.queryByLabelText(/email/i)).toBeNull()
  expect(screen.queryByRole("button", { name: "Create account" })).toBeNull()
})

test("successful registration lands on Home, not the login page", async () => {
  const { registerWithInvite } = await import("@/features/invites/server")
  vi.mocked(registerWithInvite).mockResolvedValue(undefined)

  await renderInvite({ inviterName: "Maciek" })
  fireEvent.change(screen.getByLabelText(/name/i), {
    target: { value: "New Member" },
  })
  fireEvent.change(screen.getByLabelText(/email/i), {
    target: { value: "new@example.com" },
  })
  fireEvent.change(screen.getByLabelText(/^password$/i), {
    target: { value: "password123" },
  })
  fireEvent.change(screen.getByLabelText(/confirm password/i), {
    target: { value: "password123" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Create account" }))

  await waitFor(() => {
    expect(registerWithInvite).toHaveBeenCalledWith(
      {
        data: {
          token: "tok-123",
          name: "New Member",
          email: "new@example.com",
          password: "password123",
        },
      },
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
  const { validateInvite } = await import("@/features/invites/server")
  vi.mocked(validateInvite).mockResolvedValue({ inviterName: "Maciek" })
  const { Route } = await import("./invite")
  const loader = (
    Route as unknown as {
      options: {
        loader: (ctx: {
          deps: { token: string }
        }) => Promise<{ invite: unknown }>
      }
    }
  ).options.loader

  // A present token is validated server-side.
  await expect(loader({ deps: { token: "tok-123" } })).resolves.toEqual({
    invite: { inviterName: "Maciek" },
  })

  // A missing token renders the dead-link state without a server call.
  vi.mocked(validateInvite).mockClear()
  await expect(loader({ deps: { token: "" } })).resolves.toEqual({
    invite: null,
  })
  expect(validateInvite).not.toHaveBeenCalled()
})
