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
import { updateProfile } from "@/features/account/server"
import { ProfileSection } from "./profile-section"

// The query/mutation modules import the server functions, which import the
// db — stub the server-function edge.
vi.mock("@/features/account/server", () => ({
  getCurrentUser: vi.fn(),
  updateProfile: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}))

const user: CurrentUser = {
  id: "user-1",
  email: "maciek@example.com",
  name: null,
  role: "user",
}

let queryClient: QueryClient

beforeEach(() => {
  vi.mocked(updateProfile).mockReset().mockResolvedValue(undefined)
})

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(cleanup)

function renderSection(overrides: Partial<CurrentUser> = {}) {
  const current = { ...user, ...overrides }
  queryClient = new QueryClient()
  queryClient.setQueryData(currentUserQueryOptions().queryKey, current)
  render(
    <QueryClientProvider client={queryClient}>
      <ProfileSection user={current} />
    </QueryClientProvider>,
  )
}

function cachedName() {
  const cached = queryClient.getQueryData<CurrentUser>(
    currentUserQueryOptions().queryKey,
  )
  return cached?.name
}

test("shows the email read-only with the sign-in hint", () => {
  renderSection()
  const email = screen.getByLabelText("Email") as HTMLInputElement
  expect(email.value).toBe("maciek@example.com")
  expect(email.readOnly).toBe(true)
  expect(screen.getByText(/this is your sign-in email/i)).not.toBeNull()
})

test("the display-name input falls back to the email prefix as placeholder", () => {
  renderSection()
  const input = screen.getByLabelText("Display name") as HTMLInputElement
  expect(input.value).toBe("")
  expect(input.placeholder).toBe("maciek")
})

test("committing a new name on blur saves it optimistically", async () => {
  renderSection()
  const input = screen.getByLabelText("Display name")
  fireEvent.change(input, { target: { value: "  John Doe  " } })
  fireEvent.blur(input)
  await waitFor(() =>
    expect(updateProfile).toHaveBeenCalledWith(
      { data: { name: "John Doe" } },
      expect.anything(),
    ),
  )
  expect(cachedName()).toBe("John Doe")
})

test("Enter commits the name", async () => {
  renderSection()
  const input = screen.getByLabelText("Display name")
  fireEvent.change(input, { target: { value: "John" } })
  fireEvent.keyDown(input, { key: "Enter" })
  await waitFor(() =>
    expect(updateProfile).toHaveBeenCalledWith(
      { data: { name: "John" } },
      expect.anything(),
    ),
  )
})

test("an unchanged value does not hit the server", async () => {
  renderSection({ name: "John" })
  const input = screen.getByLabelText("Display name")
  fireEvent.blur(input)
  fireEvent.change(input, { target: { value: " John " } })
  fireEvent.blur(input)
  await act(async () => {
    await Promise.resolve()
  })
  expect(updateProfile).not.toHaveBeenCalled()
})

test("clearing the name saves the email-prefix fallback (null in cache)", async () => {
  renderSection({ name: "John" })
  const input = screen.getByLabelText("Display name")
  fireEvent.change(input, { target: { value: "" } })
  fireEvent.blur(input)
  await waitFor(() =>
    expect(updateProfile).toHaveBeenCalledWith(
      { data: { name: "" } },
      expect.anything(),
    ),
  )
  expect(cachedName()).toBeNull()
})

test("a failed save rolls the cache back and shows an error toast", async () => {
  const { toast } = await import("sonner")
  vi.mocked(updateProfile).mockRejectedValue(new Error("boom"))
  renderSection({ name: "Old Name" })
  const input = screen.getByLabelText("Display name")
  fireEvent.change(input, { target: { value: "New Name" } })
  fireEvent.blur(input)
  // The optimistic write is asserted in the success test; the reject here
  // settles too fast to reliably observe the intermediate state.
  await waitFor(() => expect(updateProfile).toHaveBeenCalled())
  await waitFor(() => expect(cachedName()).toBe("Old Name"))
  expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
    "Couldn't save display name",
  )
})
