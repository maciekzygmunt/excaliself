import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { pendingInvitesQueryOptions } from "@/features/invites/queries"
import { deleteInvite } from "@/features/invites/server"
import { InvitesSection } from "./InvitesSection"

// The query module imports the server functions, which import the db — stub
// the server-function edge (the cache is seeded, so they are never called).
vi.mock("@/features/invites/server", () => ({
  createInvite: vi.fn(),
  deleteInvite: vi.fn(),
  getPendingInvites: vi.fn(),
}))

const invites = ["aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb"].map(
  (token, index) => ({
    id: `invite-${index}`,
    token,
    invitedBy: "admin",
    usedBy: null,
    usedAt: null,
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date("2026-01-01"),
  }),
)

beforeEach(() => {
  vi.useFakeTimers()
  Object.assign(navigator, { clipboard: { writeText: vi.fn() } })
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function renderSection() {
  const queryClient = new QueryClient()
  queryClient.setQueryData(pendingInvitesQueryOptions().queryKey, invites)
  render(
    <QueryClientProvider client={queryClient}>
      <InvitesSection />
    </QueryClientProvider>,
  )
}

function row(token: string) {
  const rowElement = screen
    .getByText(`${token.slice(0, 20)}...`)
    .closest(".group")
  if (!(rowElement instanceof HTMLElement)) throw new Error("row not found")
  return rowElement
}

function clickCopy(token: string) {
  fireEvent.click(within(row(token)).getByRole("button", { name: /copy/i }))
}

test("clicking copy swaps to a check that animates in", () => {
  renderSection()
  clickCopy(invites[0].token)
  const check = row(invites[0].token).querySelector(".lucide-check")
  expect(check).not.toBeNull()
  expect(check?.classList).toContain("animate-in")
  expect(check?.classList).toContain("zoom-in-50")
})

test("the check reverts to the copy icon after 2s", () => {
  renderSection()
  clickCopy(invites[0].token)
  act(() => vi.advanceTimersByTime(2000))
  expect(row(invites[0].token).querySelector(".lucide-check")).toBeNull()
  expect(row(invites[0].token).querySelector(".lucide-copy")).not.toBeNull()
})

test("copying a second invite moves the check and keeps it a full 2s", () => {
  renderSection()
  clickCopy(invites[0].token)
  act(() => vi.advanceTimersByTime(1500))
  clickCopy(invites[1].token)

  // The check moves to the second row immediately.
  expect(row(invites[0].token).querySelector(".lucide-check")).toBeNull()
  expect(row(invites[1].token).querySelector(".lucide-check")).not.toBeNull()

  // The first copy's timer must not clear the second copy's check early.
  act(() => vi.advanceTimersByTime(1000))
  expect(row(invites[1].token).querySelector(".lucide-check")).not.toBeNull()

  act(() => vi.advanceTimersByTime(1000))
  expect(row(invites[1].token).querySelector(".lucide-check")).toBeNull()
})

test("the destructive action is labeled Revoke and revokes that invite", async () => {
  renderSection()
  const revoke = within(row(invites[1].token)).getByRole("button", {
    name: /revoke/i,
  })
  fireEvent.click(revoke)
  // The mutation invokes its mutationFn on a microtask — flush it.
  await act(async () => {})
  expect(vi.mocked(deleteInvite)).toHaveBeenCalledWith(
    { data: invites[1].id },
    expect.anything(),
  )
})

test("copy is labeled as the resend affordance", () => {
  renderSection()
  // Copy doubles as resend — one labeled Copy action per pending row.
  expect(screen.getAllByRole("button", { name: /copy/i })).toHaveLength(2)
  expect(screen.queryByRole("button", { name: /resend/i })).toBeNull()
})
