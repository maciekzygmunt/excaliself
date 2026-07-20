import { beforeEach, expect, test, vi } from "vitest"

const redirect = vi.fn((opts: unknown) => ({ isRedirect: true, opts }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { loader: () => Promise<void> }) => ({
    options,
  }),
  redirect,
}))

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => ({
    handler: (fn: (ctx: unknown) => unknown) => () => fn({}),
  }),
}))

vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => new Headers(),
}))

const getSession = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}))

beforeEach(() => {
  redirect.mockClear()
})

async function loadLoader() {
  const { Route } = await import("./index")
  return (Route as unknown as { options: { loader: () => Promise<void> } })
    .options.loader
}

test("/ sends a signed-in visitor to /draw with a 301", async () => {
  const loader = await loadLoader()
  getSession.mockResolvedValueOnce({ user: { id: "u1" } })
  await expect(loader()).rejects.toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({ to: "/draw", statusCode: 301 })
})

test("/ sends a logged-out visitor to /login with a 302", async () => {
  const loader = await loadLoader()
  getSession.mockResolvedValueOnce(null)
  await expect(loader()).rejects.toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({ to: "/login", statusCode: 302 })
})
