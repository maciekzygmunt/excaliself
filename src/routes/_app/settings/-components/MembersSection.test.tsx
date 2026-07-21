import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { currentUserQueryOptions } from "@/features/account/queries"
import { usersQueryOptions } from "@/features/admin/queries"
import {
  deleteUser,
  getAllUsers,
  getUserContentCounts,
} from "@/features/admin/server"
import { MembersSection } from "./MembersSection"

// The query modules import the server functions, which import the db — stub
// the server-function edge (the caches are seeded, so most are never called).
vi.mock("@/features/admin/server", () => ({
  getAllUsers: vi.fn(),
  deleteUser: vi.fn(),
  getUserContentCounts: vi.fn(),
}))
vi.mock("@/features/account/server", () => ({
  getCurrentUser: vi.fn(),
  listActiveSessions: vi.fn(),
}))

// Deliberately out of join order: Bea (Feb) before ada (Jan) before Cy (Mar).
const members = [
  {
    id: "user-bea",
    email: "bea@example.com",
    emailVerified: true,
    name: "Bea",
    image: null,
    role: "user" as const,
    createdAt: new Date("2026-02-01T12:00:00Z"),
    updatedAt: new Date("2026-02-01T12:00:00Z"),
  },
  {
    id: "user-ada",
    email: "ada@example.com",
    emailVerified: true,
    name: null,
    image: null,
    role: "admin" as const,
    createdAt: new Date("2026-01-05T12:00:00Z"),
    updatedAt: new Date("2026-01-05T12:00:00Z"),
  },
  {
    id: "user-cy",
    email: "cy@example.com",
    emailVerified: true,
    name: "Cy",
    image: null,
    role: "user" as const,
    createdAt: new Date("2026-03-10T12:00:00Z"),
    updatedAt: new Date("2026-03-10T12:00:00Z"),
  },
]

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// The viewer is ada — the (sole) admin browsing the members page.
const viewer = {
  id: "user-ada",
  email: "ada@example.com",
  name: null,
  role: "admin" as const,
}

function renderSection({ seed = true } = {}) {
  // retry: false so a mocked query rejection reaches error state promptly.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (seed) {
    queryClient.setQueryData(usersQueryOptions().queryKey, members)
  }
  queryClient.setQueryData(currentUserQueryOptions().queryKey, viewer)
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersSection />
    </QueryClientProvider>,
  )
}

const flush = () => act(async () => {})

function openRowMenu(name: string) {
  const trigger = screen.getByRole("button", { name: `Actions for ${name}` })
  fireEvent.pointerDown(trigger)
  fireEvent.click(trigger)
}

test("the header shows the member count", () => {
  renderSection()
  expect(screen.getByText("3 members")).not.toBeNull()
})

test("a single member is counted in the singular", () => {
  const queryClient = new QueryClient()
  queryClient.setQueryData(usersQueryOptions().queryKey, [members[0]])
  render(
    <QueryClientProvider client={queryClient}>
      <MembersSection />
    </QueryClientProvider>,
  )
  expect(screen.getByText("1 member")).not.toBeNull()
})

test("members are listed by join date with display name, email, and joined date", () => {
  renderSection()

  // ada has no display name, so the email prefix stands in (spec §5.12).
  const names = screen
    .getAllByRole("listitem")
    .map((item) => item.querySelector("p")?.textContent)
  expect(names).toEqual(["ada", "Bea", "Cy"])

  expect(screen.getByText("ada@example.com")).not.toBeNull()
  expect(
    screen.getByText(
      `Joined ${new Date("2026-01-05T12:00:00Z").toLocaleDateString()}`,
    ),
  ).not.toBeNull()
})

test("every row carries the shared initials avatar", () => {
  const { container } = renderSection()
  // InitialsAvatar is the decorative initials circle (aria-hidden span).
  expect(
    container.querySelectorAll("span[aria-hidden='true'].rounded-full"),
  ).toHaveLength(3)
})

test("every row except your own offers an actions menu", () => {
  renderSection()
  // Covers both the no-self-delete and sole-admin UI blocks — see the
  // rationale comment in MembersSection.
  expect(screen.queryByRole("button", { name: "Actions for ada" })).toBeNull()
  expect(screen.getByRole("button", { name: "Actions for Bea" })).toBeTruthy()
  expect(screen.getByRole("button", { name: "Actions for Cy" })).toBeTruthy()
})

test("Delete user opens the tier-3 dialog with live content counts and an email challenge", async () => {
  vi.mocked(getUserContentCounts).mockResolvedValue({ drawings: 3, folders: 1 })
  renderSection()

  openRowMenu("Bea")
  fireEvent.click(screen.getByRole("menuitem", { name: /delete user/i }))
  await flush()

  expect(getUserContentCounts).toHaveBeenCalledWith({ data: "user-bea" })
  expect(
    await screen.findByText(/permanently delete their 3 drawings and 1 folder/),
  ).toBeTruthy()

  // Armed only by typing the exact email.
  const confirm = () =>
    screen.getByRole("button", { name: "Delete user" }) as HTMLButtonElement
  expect(confirm().disabled).toBe(true)
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "bea@example" },
  })
  expect(confirm().disabled).toBe(true)
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "bea@example.com" },
  })
  expect(confirm().disabled).toBe(false)
})

test("a failed counts fetch explains itself and keeps confirm gated", async () => {
  vi.mocked(getUserContentCounts).mockRejectedValue(new Error("boom"))
  renderSection()

  openRowMenu("Bea")
  fireEvent.click(screen.getByRole("menuitem", { name: /delete user/i }))

  expect(
    await screen.findByText(/Couldn't load Bea's content counts/),
  ).toBeTruthy()
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "bea@example.com" },
  })
  expect(
    (screen.getByRole("button", { name: "Delete user" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
})

test("the confirm stays gated while the counts are still loading", async () => {
  vi.mocked(getUserContentCounts).mockReturnValue(new Promise(() => {}))
  renderSection()

  openRowMenu("Bea")
  fireEvent.click(screen.getByRole("menuitem", { name: /delete user/i }))
  await flush()

  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "bea@example.com" },
  })
  expect(
    (screen.getByRole("button", { name: "Delete user" }) as HTMLButtonElement)
      .disabled,
  ).toBe(true)
})

test("confirming deletes the user and the refreshed list drops them", async () => {
  vi.mocked(getUserContentCounts).mockResolvedValue({ drawings: 0, folders: 0 })
  vi.mocked(deleteUser).mockResolvedValue(undefined)
  // The list server fn mirrors reality: Bea is gone only once the delete
  // has landed — so the success invalidation's refetch drops her row.
  vi.mocked(getAllUsers).mockImplementation(async () =>
    vi.mocked(deleteUser).mock.calls.length > 0
      ? members.filter((member) => member.id !== "user-bea")
      : members,
  )
  renderSection()

  openRowMenu("Bea")
  fireEvent.click(screen.getByRole("menuitem", { name: /delete user/i }))
  await flush()
  fireEvent.change(screen.getByRole("textbox"), {
    target: { value: "bea@example.com" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Delete user" }))
  await flush()

  expect(deleteUser).toHaveBeenCalledWith({ data: "user-bea" })
  await waitFor(() => expect(screen.queryByText("bea@example.com")).toBeNull())
  expect(screen.queryByRole("alertdialog")).toBeNull()
})

test("the skeleton appears only after the grace period", () => {
  vi.useFakeTimers()
  vi.mocked(getAllUsers).mockReturnValue(new Promise(() => {}))
  const { container } = renderSection({ seed: false })

  // Within the grace period nothing renders — no skeleton flash.
  expect(container.querySelector("[data-slot='skeleton']")).toBeNull()

  act(() => vi.advanceTimersByTime(150))
  expect(container.querySelector("[data-slot='skeleton']")).not.toBeNull()
})
