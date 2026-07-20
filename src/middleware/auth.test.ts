import { expect, test, vi } from "vitest"

const redirect = vi.fn((opts: unknown) => ({ isRedirect: true, opts }))

vi.mock("@tanstack/react-router", () => ({
  redirect,
}))

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (server: unknown) => ({ options: { server } }),
  }),
}))

const getSession = vi.fn()
vi.mock("@/lib/auth", () => ({
  auth: { api: { getSession: (...args: unknown[]) => getSession(...args) } },
}))

let request: Request
vi.mock("@tanstack/react-start/server", () => ({
  getRequestHeaders: () => request.headers,
  getRequest: () => request,
  getRequestUrl: () => new URL(request.url),
}))

type ServerHandler = (ctx: {
  next: (opts?: unknown) => Promise<unknown>
}) => Promise<unknown>

async function loadHandler() {
  const { authMiddleware } = await import("./auth")
  return (authMiddleware as unknown as { options: { server: ServerHandler } })
    .options.server
}

test("logged-out page request 302s to /login with the path as ?redirect", async () => {
  const handler = await loadHandler()
  request = new Request("http://localhost:3000/draw/abc123?tab=export")
  getSession.mockResolvedValueOnce(null)
  const next = vi.fn()

  await expect(handler({ next })).rejects.toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({
    to: "/login",
    search: { redirect: "/draw/abc123?tab=export" },
    statusCode: 302,
  })
  expect(next).not.toHaveBeenCalled()
})

test("logged-out server-fn request redirects to plain /login", async () => {
  const handler = await loadHandler()
  request = new Request("http://localhost:3000/_serverFn/abc", {
    headers: { "x-tsr-serverFn": "true" },
  })
  getSession.mockResolvedValueOnce(null)

  await expect(handler({ next: vi.fn() })).rejects.toMatchObject({
    isRedirect: true,
  })
  expect(redirect).toHaveBeenLastCalledWith({
    to: "/login",
    search: { redirect: undefined },
    statusCode: 302,
  })
})

test("a live session passes through with the session in context", async () => {
  const handler = await loadHandler()
  request = new Request("http://localhost:3000/draw")
  const session = { user: { id: "u1" } }
  getSession.mockResolvedValueOnce(session)
  const next = vi.fn().mockResolvedValue("next-result")

  await expect(handler({ next })).resolves.toBe("next-result")
  expect(next).toHaveBeenCalledWith({ context: { session } })
})
