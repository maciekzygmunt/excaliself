import { beforeEach, expect, test, vi } from "vitest"

const redirect = vi.fn((opts: unknown) => ({ isRedirect: true, opts }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { loader: () => void }) => ({ options }),
  redirect,
}))

beforeEach(() => {
  redirect.mockClear()
})

test("/admin permanently redirects to /settings/members", async () => {
  const { Route } = await import("./admin")
  const loader = (Route as unknown as { options: { loader: () => void } })
    .options.loader

  let thrown: unknown
  try {
    loader()
  } catch (error) {
    thrown = error
  }
  expect(thrown).toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({
    to: "/settings/members",
    statusCode: 301,
  })
})
