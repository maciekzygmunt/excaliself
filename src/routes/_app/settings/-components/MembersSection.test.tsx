import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import { usersQueryOptions } from "@/features/admin/queries"
import { getAllUsers } from "@/features/admin/server"
import { MembersSection } from "./MembersSection"

// The query module imports the server function, which imports the db — stub
// the server-function edge (the cache is seeded, so it is never called).
vi.mock("@/features/admin/server", () => ({
  getAllUsers: vi.fn(),
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

function renderSection({ seed = true } = {}) {
  const queryClient = new QueryClient()
  if (seed) {
    queryClient.setQueryData(usersQueryOptions().queryKey, members)
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersSection />
    </QueryClientProvider>,
  )
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
  const names = screen.getAllByTestId("member-name").map((el) => el.textContent)
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

test("the lean list offers no row actions", () => {
  renderSection()
  expect(screen.queryAllByRole("button")).toHaveLength(0)
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
