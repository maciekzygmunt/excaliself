import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import {
  type CurrentUser,
  currentUserQueryOptions,
} from "@/features/account/queries"
import { updateTheme } from "@/features/account/server"
import { AppearanceSection } from "./AppearanceSection"

// The query/mutation modules import the server functions, which import the
// db — stub the server-function edge (the admin one comes in via the
// member-list invalidation in useUpdateProfile).
vi.mock("@/features/account/server", () => ({
  getCurrentUser: vi.fn(),
  updateTheme: vi.fn(),
}))
vi.mock("@/features/admin/server", () => ({
  getAllUsers: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const user: CurrentUser = {
  id: "user-1",
  email: "maciek@example.com",
  name: null,
  role: "user",
  theme: "light",
}

let queryClient: QueryClient

beforeEach(() => {
  vi.mocked(updateTheme).mockReset().mockResolvedValue(undefined)
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderSection(overrides: Partial<CurrentUser> = {}) {
  const current = { ...user, ...overrides }
  queryClient = new QueryClient()
  queryClient.setQueryData(currentUserQueryOptions().queryKey, current)
  render(
    <QueryClientProvider client={queryClient}>
      <AppearanceSection user={current} />
    </QueryClientProvider>,
  )
}

function cachedTheme() {
  const cached = queryClient.getQueryData<CurrentUser>(
    currentUserQueryOptions().queryKey,
  )
  return cached?.theme
}

test("offers Light, Dark and System — a user who never chose has Light selected", () => {
  renderSection()
  const light = screen.getByRole("radio", { name: "Light" })
  expect(light.getAttribute("aria-checked")).toBe("true")
  expect(
    screen.getByRole("radio", { name: "Dark" }).getAttribute("aria-checked"),
  ).toBe("false")
  expect(
    screen.getByRole("radio", { name: "System" }).getAttribute("aria-checked"),
  ).toBe("false")
})

test("picking a theme saves it optimistically into the currentUser cache", async () => {
  renderSection()
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
  // The optimistic write lands right after onMutate's cancelQueries tick.
  await waitFor(() => expect(cachedTheme()).toBe("dark"))
  await waitFor(() =>
    expect(updateTheme).toHaveBeenCalledWith(
      { data: { theme: "dark" } },
      expect.anything(),
    ),
  )
})

test("re-picking the already selected theme does not hit the server", async () => {
  renderSection({ theme: "system" })
  fireEvent.click(screen.getByRole("radio", { name: "System" }))
  await act(async () => {
    await Promise.resolve()
  })
  expect(updateTheme).not.toHaveBeenCalled()
})

test("a failed save rolls the cache back and shows an error toast", async () => {
  const { toast } = await import("sonner")
  vi.mocked(updateTheme).mockRejectedValue(new Error("boom"))
  renderSection()
  fireEvent.click(screen.getByRole("radio", { name: "Dark" }))
  await waitFor(() => expect(updateTheme).toHaveBeenCalled())
  await waitFor(() => expect(cachedTheme()).toBe("light"))
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
    "Couldn't save theme preference",
  )
})
