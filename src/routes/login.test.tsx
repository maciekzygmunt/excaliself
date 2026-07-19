import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { stubSystemTheme } from "@/test/system-theme"

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
  }),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/lib/auth-client", () => ({
  authClient: { signIn: { email: vi.fn() } },
}))

vi.mock("@/middleware/setup", () => ({
  setupMiddleware: {},
}))

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)
afterEach(() => {
  vi.unstubAllGlobals()
})

beforeEach(() => {
  stubSystemTheme(false)
})

async function renderLogin() {
  const { Route } = await import("./login")
  const LoginPage = (
    Route as unknown as { options: { component: React.ComponentType } }
  ).options.component
  return render(<LoginPage />)
}

test("login is email + password + Sign in — nothing else", async () => {
  await renderLogin()
  expect(screen.getByLabelText(/email/i)).toBeDefined()
  expect(screen.getByLabelText(/password/i)).toBeDefined()
  expect(screen.getByRole("button", { name: "Sign in" })).toBeDefined()
  // No remember-me, SSO, or self-serve reset on this instance.
  expect(screen.queryByRole("checkbox")).toBeNull()
  expect(screen.queryByText(/remember me/i)).toBeNull()
  expect(screen.queryByRole("link")).toBeNull()
})

test("microcopy explains invite-only registration and admin-managed resets", async () => {
  await renderLogin()
  expect(
    screen.getByText("Registration is invite-only on this instance"),
  ).toBeDefined()
  expect(
    screen.getByText("Forgot your password? Ask your admin to reset it."),
  ).toBeDefined()
})
