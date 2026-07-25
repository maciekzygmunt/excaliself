import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  createShare,
  regenerateShare,
  stopSharing,
} from "@/features/shares/server"
import { ShareDialog } from "./ShareDialog"

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), dismiss: vi.fn() }),
}))

vi.mock("@/features/shares/server", () => ({
  getDrawingShare: vi.fn(),
  createShare: vi.fn(),
  stopSharing: vi.fn(),
  regenerateShare: vi.fn(),
  setShareAudience: vi.fn(),
}))

const TOKEN = "a".repeat(64)
const SHARE = {
  token: TOKEN,
  audience: "members" as const,
  createdAt: new Date("2026-07-20"),
}

function renderDialog(share: typeof SHARE | null) {
  // staleTime pins the seeded cache: with the default 0 the mounted query
  // refetches in the background against the unconfigured getDrawingShare
  // mock and flips the dialog to the unshared state mid-test.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: Number.POSITIVE_INFINITY } },
  })
  queryClient.setQueryData(["shares", "d1"], share)
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  render(<ShareDialog drawingId="d1" open onOpenChange={vi.fn()} />, {
    wrapper,
  })
  return queryClient
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Auto-cleanup needs vitest globals, which this repo leaves off; without it
// dialog portals from the previous test linger in document.body.
afterEach(cleanup)

test("unshared: audience cards are pickable before the link exists and seed the create call", async () => {
  vi.mocked(createShare).mockResolvedValue({ ...SHARE, audience: "anyone" })
  renderDialog(null)

  // Both radio cards with their descriptions, no link row yet.
  expect(screen.getByText("Members of this instance")).toBeDefined()
  expect(screen.getByText("Anyone with the link")).toBeDefined()
  expect(screen.queryByText(/Stop sharing/)).toBeNull()

  fireEvent.click(screen.getByRole("radio", { name: /anyone with the link/i }))
  fireEvent.click(screen.getByRole("button", { name: /create share link/i }))

  await waitFor(() =>
    expect(createShare).toHaveBeenCalledWith({
      data: { drawingId: "d1", audience: "anyone" },
    }),
  )
})

test("shared: shows the link row, both audience cards, and the stop/regenerate footer", () => {
  renderDialog(SHARE)

  expect(screen.getByText(new RegExp(`/share/${TOKEN}`))).toBeDefined()
  expect(
    screen.getByRole("radio", { name: /members of this instance/i }),
  ).toBeDefined()
  expect(screen.getByRole("button", { name: /stop sharing/i })).toBeDefined()
  expect(screen.getByRole("button", { name: /regenerate link/i })).toBeDefined()
  expect(screen.queryByText(/create share link/i)).toBeNull()
})

test("copy button gives feedback after copying the link", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  })
  renderDialog(SHARE)

  fireEvent.click(screen.getByRole("button", { name: /copy/i }))

  expect(writeText).toHaveBeenCalledWith(
    `${window.location.origin}/share/${TOKEN}`,
  )
  await waitFor(() => expect(screen.getByText("Copied")).toBeDefined())
})

test('a failed copy never claims success — error toast instead of "Copied"', async () => {
  // Insecure origins (self-hosted over plain HTTP) reject or lack the
  // clipboard API; jsdom also has no execCommand, so both paths fail here.
  const writeText = vi.fn().mockRejectedValue(new Error("denied"))
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  })
  renderDialog(SHARE)

  fireEvent.click(screen.getByRole("button", { name: /copy/i }))

  await waitFor(() => expect(toast.error).toHaveBeenCalled())
  expect(screen.queryByText("Copied")).toBeNull()
})

test("every share control is disabled while any share mutation is in flight", async () => {
  // A stop that never resolves keeps the dialog busy.
  vi.mocked(stopSharing).mockReturnValue(new Promise(() => {}))
  renderDialog(SHARE)

  fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))

  await waitFor(() =>
    expect(screen.getByRole("button", { name: /stopping/i })).toHaveProperty(
      "disabled",
      true,
    ),
  )
  expect(
    screen.getByRole("button", { name: /regenerate link/i }),
  ).toHaveProperty("disabled", true)
  expect(
    screen.getByRole("radio", { name: /anyone with the link/i }),
  ).toHaveProperty("disabled", true)
})

test("stop sharing empties the cached share so the dialog flips to the unshared state", async () => {
  vi.mocked(stopSharing).mockResolvedValue(undefined)
  const queryClient = renderDialog(SHARE)

  fireEvent.click(screen.getByRole("button", { name: /stop sharing/i }))

  await waitFor(() => expect(stopSharing).toHaveBeenCalledWith({ data: "d1" }))
  await waitFor(() =>
    expect(queryClient.getQueryData(["shares", "d1"])).toBeNull(),
  )
})

test("regenerate swaps the cached token", async () => {
  const regenerated = { ...SHARE, token: "b".repeat(64) }
  vi.mocked(regenerateShare).mockResolvedValue(regenerated)
  const queryClient = renderDialog(SHARE)

  fireEvent.click(screen.getByRole("button", { name: /regenerate link/i }))

  await waitFor(() =>
    expect(queryClient.getQueryData(["shares", "d1"])).toEqual(regenerated),
  )
})
