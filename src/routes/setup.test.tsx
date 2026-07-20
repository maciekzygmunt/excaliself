import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"

const redirect = vi.fn((opts: unknown) => ({ isRedirect: true, opts }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute:
    () =>
    (options: {
      component: React.ComponentType
      beforeLoad: () => Promise<void>
    }) => ({ options }),
  useNavigate: () => vi.fn(),
  redirect,
}))

const getUserCount = vi.fn()

vi.mock("@/features/admin/server", () => ({
  getUserCount: (...args: unknown[]) => getUserCount(...args),
  setupAdmin: vi.fn(),
}))

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

type RouteModule = {
  options: {
    component: React.ComponentType
    beforeLoad: () => Promise<void>
  }
}

async function loadRoute() {
  const { Route } = await import("./setup")
  return (Route as unknown as RouteModule).options
}

test("setup is email + password + submit — no name or confirm fields", async () => {
  const { component: SetupPage } = await loadRoute()
  render(<SetupPage />)
  expect(screen.getByLabelText(/email/i)).toBeDefined()
  expect(screen.getByLabelText(/^password/i)).toBeDefined()
  expect(screen.getByRole("button", { name: /create admin/i })).toBeDefined()
  // Single-form setup, no wizard: just the two credential fields.
  expect(screen.queryByLabelText(/name/i)).toBeNull()
  expect(screen.queryByLabelText(/confirm/i)).toBeNull()
})

test("renders the specced title in the auth shell", async () => {
  const { component: SetupPage } = await loadRoute()
  render(<SetupPage />)
  expect(
    screen.getByRole("heading", { name: "Set up your instance" }),
  ).toBeDefined()
})

test("beforeLoad redirects to /login once a user exists", async () => {
  const { beforeLoad } = await loadRoute()
  getUserCount.mockResolvedValueOnce(1)
  await expect(beforeLoad()).rejects.toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({ to: "/login" })
})

test("beforeLoad lets a fresh instance through", async () => {
  const { beforeLoad } = await loadRoute()
  getUserCount.mockResolvedValueOnce(0)
  await expect(beforeLoad()).resolves.toBeUndefined()
})
