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
import { usersQueryOptions } from "@/features/admin/queries"
import { getAllUsers } from "@/features/admin/server"
import { pendingPasswordResetsQueryOptions } from "@/features/password-resets/queries"
import {
  createPasswordReset,
  getPendingPasswordResets,
  revokePasswordReset,
} from "@/features/password-resets/server"
import { MembersSection } from "./MembersSection"

// The query modules import the server functions, which import the db — stub
// the server-function edge (the cache is seeded, so they are never called).
vi.mock("@/features/admin/server", () => ({
  getAllUsers: vi.fn(),
}))
vi.mock("@/features/password-resets/server", () => ({
  createPasswordReset: vi.fn(),
  getPendingPasswordResets: vi.fn(),
  revokePasswordReset: vi.fn(),
}))
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

const clipboardWriteText = vi.fn()

// Auto-cleanup needs vitest globals, which this repo leaves off.
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => {
  vi.clearAllMocks()
  clipboardWriteText.mockResolvedValue(undefined)
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: clipboardWriteText },
    configurable: true,
  })
  vi.mocked(getPendingPasswordResets).mockResolvedValue([])
})

function renderSection({
  seed = true,
  pendingResets = [] as { userId: string }[],
} = {}) {
  const queryClient = new QueryClient()
  if (seed) {
    queryClient.setQueryData(usersQueryOptions().queryKey, members)
    queryClient.setQueryData(
      pendingPasswordResetsQueryOptions().queryKey,
      pendingResets,
    )
  }
  return render(
    <QueryClientProvider client={queryClient}>
      <MembersSection />
    </QueryClientProvider>,
  )
}

// Radix menus open on pointerdown, which jsdom needs fired explicitly.
function openRowMenu(name: RegExp) {
  const trigger = screen.getByRole("button", { name })
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
  queryClient.setQueryData(pendingPasswordResetsQueryOptions().queryKey, [])
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

test("every row offers an overflow menu with Reset password — admins included", () => {
  renderSection()
  // One overflow trigger per member; ada is an admin and gets one too.
  expect(screen.getAllByRole("button", { name: /actions for/i })).toHaveLength(
    3,
  )
  openRowMenu(/actions for ada/i)
  expect(
    screen.getByRole("menuitem", { name: /reset password/i }),
  ).not.toBeNull()
})

test("Reset password generates a link, copies it, and confirms with a toast", async () => {
  const { toast } = await import("sonner")
  vi.mocked(createPasswordReset).mockResolvedValue({ token: "tok-xyz" })
  renderSection()

  openRowMenu(/actions for ada/i)
  fireEvent.click(screen.getByRole("menuitem", { name: /reset password/i }))

  await waitFor(() => {
    expect(createPasswordReset).toHaveBeenCalledWith(
      { data: { userId: "user-ada" } },
      // react-query passes its mutation context as a second argument.
      expect.anything(),
    )
  })
  await waitFor(() => {
    expect(clipboardWriteText).toHaveBeenCalledWith(
      `${window.location.origin}/reset-password?token=tok-xyz`,
    )
  })
  expect(toast.success).toHaveBeenCalled()
})

test("a pending reset shows a row hint with a revoke action", async () => {
  renderSection({ pendingResets: [{ userId: "user-ada" }] })

  // Only ada's row hints at the outstanding link.
  expect(screen.getAllByText("Reset link pending")).toHaveLength(1)

  fireEvent.click(screen.getByRole("button", { name: /revoke/i }))
  await waitFor(() => {
    expect(revokePasswordReset).toHaveBeenCalledWith(
      { data: { userId: "user-ada" } },
      expect.anything(),
    )
  })
})

test("rows without a pending reset show no hint or revoke", () => {
  renderSection()
  expect(screen.queryByText("Reset link pending")).toBeNull()
  expect(screen.queryByRole("button", { name: /revoke/i })).toBeNull()
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
