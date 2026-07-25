import { cleanup, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import type { ShareTokenResult } from "@/features/shares/server"

const { loaderState, guestCanvasMock } = vi.hoisted(() => ({
  loaderState: { data: null as { result: ShareTokenResult } | null },
  guestCanvasMock: vi.fn(() => <div data-testid="guest-canvas" />),
}))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: React.ComponentType }) => ({
    options,
    useLoaderData: () => loaderState.data,
    useParams: () => ({ token: "tok-123" }),
  }),
  Link: ({
    to,
    search,
    children,
    ...rest
  }: {
    to: string
    search?: Record<string, string>
    children: ReactNode
  }) => (
    <a href={to} data-search={JSON.stringify(search ?? null)} {...rest}>
      {children}
    </a>
  ),
}))

vi.mock("@/features/shares/server", () => ({
  validateShareToken: vi.fn(),
}))

vi.mock("./-share/GuestCanvas", () => ({ default: guestCanvasMock }))

afterEach(cleanup)
beforeEach(() => {
  guestCanvasMock.mockClear()
})

async function renderShare(result: ShareTokenResult) {
  loaderState.data = { result }
  const { Route } = await import("./share.$token")
  const SharePage = (
    Route as unknown as { options: { component: React.ComponentType } }
  ).options.component
  return render(<SharePage />)
}

test("dead link renders the one generic page with a way home", async () => {
  await renderShare({ state: "dead" })
  expect(
    screen.getByRole("heading", { name: "This link is no longer active" }),
  ).toBeDefined()
  // Generic on purpose (spec §1.4): never-existed, stopped, regenerated, and
  // trashed must be indistinguishable — the copy names no cause.
  expect(
    screen.getByText(
      "It may have been turned off or replaced by the drawing's owner.",
    ),
  ).toBeDefined()
  const home = screen.getByRole("link", { name: "Go to Excaliself" })
  expect(home.getAttribute("href")).toBe("/")
  expect(screen.queryByTestId("guest-canvas")).toBeNull()
})

test("members-only link without a session gates on sign-in and returns here after", async () => {
  await renderShare({ state: "signin", drawingName: "Roadmap sketches" })
  expect(
    screen.getByRole("heading", { name: "Sign in to open this drawing" }),
  ).toBeDefined()
  expect(screen.getByText(/Roadmap sketches/)).toBeDefined()
  const signIn = screen.getByRole("link", { name: "Sign in" })
  expect(signIn.getAttribute("href")).toBe("/login")
  expect(JSON.parse(signIn.getAttribute("data-search") ?? "null")).toEqual({
    redirect: "/share/tok-123",
  })
  expect(screen.queryByTestId("guest-canvas")).toBeNull()
})

test("valid token opens the drawing on the guest canvas", async () => {
  const drawing = { id: "d1", name: "Roadmap sketches", data: "{}" }
  const files = [{ fileId: "f1", mimeType: "image/png", dataUrl: "data:" }]
  await renderShare({ state: "ok", drawing, files })

  await waitFor(() => {
    expect(screen.getByTestId("guest-canvas")).toBeDefined()
  })
  expect(guestCanvasMock).toHaveBeenCalledWith(
    expect.objectContaining({ drawing, files }),
    undefined,
  )
  expect(document.title).toContain("Roadmap sketches")
})

test("loader validates the token server-side on every load", async () => {
  const { validateShareToken } = await import("@/features/shares/server")
  vi.mocked(validateShareToken).mockResolvedValue({ state: "dead" })
  const { Route } = await import("./share.$token")
  const loader = (
    Route as unknown as {
      options: {
        loader: (ctx: {
          params: { token: string }
        }) => Promise<{ result: ShareTokenResult }>
      }
    }
  ).options.loader

  await expect(loader({ params: { token: "tok-123" } })).resolves.toEqual({
    result: { state: "dead" },
  })
  expect(validateShareToken).toHaveBeenCalledWith({ data: "tok-123" })
})
