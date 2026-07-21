import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  type ActiveSession,
  sessionsQueryOptions,
} from "@/features/account/queries"
import {
  listActiveSessions,
  revokeOtherSessions,
  revokeSessionById,
} from "@/features/account/server"
import { SessionsSection } from "./SessionsSection"

// The query/mutation modules import the server functions, which import the
// db — stub the server-function edge.
vi.mock("@/features/account/server", () => ({
  getCurrentUser: vi.fn(),
  updateProfile: vi.fn(),
  listActiveSessions: vi.fn(),
  revokeSessionById: vi.fn(),
  revokeOtherSessions: vi.fn(),
}))
vi.mock("@/features/admin/server", () => ({
  getAllUsers: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
const FIREFOX_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0"

const currentSession: ActiveSession = {
  id: "session-1",
  ipAddress: "203.0.113.7",
  userAgent: CHROME_MAC,
  lastActiveAt: new Date(),
  current: true,
}

const otherSession: ActiveSession = {
  id: "session-2",
  ipAddress: "198.51.100.4",
  userAgent: FIREFOX_WINDOWS,
  lastActiveAt: new Date(Date.now() - 5 * 60_000),
  current: false,
}

const thirdSession: ActiveSession = {
  id: "session-3",
  ipAddress: "192.0.2.9",
  userAgent: FIREFOX_WINDOWS,
  lastActiveAt: new Date(Date.now() - 60 * 60_000),
  current: false,
}

let queryClient: QueryClient

beforeEach(() => {
  vi.mocked(revokeSessionById).mockReset().mockResolvedValue(undefined)
  vi.mocked(revokeOtherSessions).mockReset().mockResolvedValue(undefined)
  vi.mocked(listActiveSessions).mockReset()
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderSection(sessions?: ActiveSession[]) {
  queryClient = new QueryClient()
  if (sessions) {
    queryClient.setQueryData(sessionsQueryOptions().queryKey, sessions)
  }
  render(
    <QueryClientProvider client={queryClient}>
      <SessionsSection />
    </QueryClientProvider>,
  )
}

function cachedIds() {
  const cached = queryClient.getQueryData<ActiveSession[]>(
    sessionsQueryOptions().queryKey,
  )
  return cached?.map((session) => session.id)
}

test("lists device, IP, and last-active for each session", () => {
  renderSection([currentSession, otherSession])
  expect(screen.getByText("Chrome on macOS")).not.toBeNull()
  expect(screen.getByText(/203\.0\.113\.7/)).not.toBeNull()
  expect(screen.getByText("Firefox on Windows")).not.toBeNull()
  expect(screen.getByText(/198\.51\.100\.4 · 5m ago/)).not.toBeNull()
})

test("marks the current session and offers no revoke on its row", () => {
  renderSection([currentSession, otherSession])
  expect(screen.getByText("Current session")).not.toBeNull()
  // One revoke button — the other session's; the current row has none.
  expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(1)
})

test("revoking a session calls the server and drops the row optimistically", async () => {
  renderSection([currentSession, otherSession])
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }))
  await waitFor(() => expect(cachedIds()).toEqual(["session-1"]))
  await waitFor(() =>
    expect(revokeSessionById).toHaveBeenCalledWith(
      { data: { id: "session-2" } },
      expect.anything(),
    ),
  )
})

test("a failed revoke rolls the row back and shows an error toast", async () => {
  const { toast } = await import("sonner")
  vi.mocked(revokeSessionById).mockRejectedValue(new Error("boom"))
  renderSection([currentSession, otherSession])
  fireEvent.click(screen.getByRole("button", { name: "Revoke" }))
  await waitFor(() => expect(cachedIds()).toEqual(["session-1", "session-2"]))
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith("Couldn't revoke session")
})

test("sign out other sessions revokes everything but the current one", async () => {
  renderSection([currentSession, otherSession])
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out all other sessions" }),
  )
  await waitFor(() => expect(cachedIds()).toEqual(["session-1"]))
  await waitFor(() => expect(revokeOtherSessions).toHaveBeenCalled())
})

test("a failed revoke does not resurrect rows a later overlapping revoke removed", async () => {
  const { toast } = await import("sonner")
  let rejectFirst!: (err: Error) => void
  vi.mocked(revokeSessionById).mockImplementationOnce(
    () =>
      new Promise((_resolve, reject) => {
        rejectFirst = reject
      }),
  )
  renderSection([currentSession, otherSession, thirdSession])

  // First revoke (session-2) stays in flight...
  fireEvent.click(screen.getAllByRole("button", { name: "Revoke" })[0])
  await waitFor(() => expect(cachedIds()).toEqual(["session-1", "session-3"]))

  // ...while sign-out-others lands its optimistic removal immediately.
  fireEvent.click(
    screen.getByRole("button", { name: "Sign out all other sessions" }),
  )
  await waitFor(() => expect(cachedIds()).toEqual(["session-1"]))

  // The failed revoke re-inserts only its own row — session-3 stays removed.
  rejectFirst(new Error("boom"))
  await waitFor(() =>
    expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
      "Couldn't revoke session",
    ),
  )
  expect(cachedIds()).toEqual(["session-1", "session-2"])
})

test("the sign-out-others button is absent with only the current session", () => {
  renderSection([currentSession])
  expect(
    screen.queryByRole("button", { name: "Sign out all other sessions" }),
  ).toBeNull()
})

test("a pending load shows nothing at first, then the delayed skeleton", async () => {
  vi.mocked(listActiveSessions).mockReturnValue(new Promise(() => {}))
  renderSection()
  expect(document.querySelector('[data-slot="skeleton"]')).toBeNull()
  await waitFor(() =>
    expect(document.querySelector('[data-slot="skeleton"]')).not.toBeNull(),
  )
})
