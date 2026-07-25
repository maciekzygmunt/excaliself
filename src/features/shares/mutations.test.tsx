import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, expect, test, vi } from "vitest"
import {
  useCreateShare,
  useRegenerateShareToken,
  useSetShareAudience,
  useStopSharing,
} from "./mutations"
import type { Share } from "./queries"

const { toastMock, serverMocks } = vi.hoisted(() => {
  const toastMock = Object.assign(vi.fn(), { error: vi.fn() })
  const serverMocks = {
    getShareForDrawing: vi.fn(),
    createShare: vi.fn(),
    stopSharing: vi.fn(),
    regenerateShareToken: vi.fn(),
    setShareAudience: vi.fn(),
  }
  return { toastMock, serverMocks }
})

vi.mock("sonner", () => ({ toast: toastMock }))
vi.mock("./server", () => serverMocks)

const drawingId = "d1"
const shareKey = ["share", drawingId]

function setup<T>(hook: () => T, initialShare?: Share | null) {
  const queryClient = new QueryClient()
  if (initialShare !== undefined) {
    queryClient.setQueryData(shareKey, initialShare)
  }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  const { result } = renderHook(hook, { wrapper })
  return { queryClient, hook: result }
}

const flush = () => act(async () => {})

beforeEach(() => {
  vi.clearAllMocks()
})

test("creating a share puts the fresh link straight into the cache", async () => {
  const share: Share = { token: "tok-new", audience: "anyone" }
  serverMocks.createShare.mockResolvedValue(share)
  const { queryClient, hook } = setup(() => useCreateShare(drawingId), null)

  act(() => hook.current.mutate("anyone"))
  await flush()

  expect(serverMocks.createShare).toHaveBeenCalledWith({
    data: { drawingId, audience: "anyone" },
  })
  expect(queryClient.getQueryData(shareKey)).toEqual(share)
})

test("stopping a share clears the cache and confirms the link is dead", async () => {
  serverMocks.stopSharing.mockResolvedValue(undefined)
  const { queryClient, hook } = setup(() => useStopSharing(drawingId), {
    token: "tok-1",
    audience: "members",
  })

  act(() => hook.current.mutate())
  await flush()

  expect(queryClient.getQueryData(shareKey)).toBeNull()
  expect(toastMock).toHaveBeenCalledWith(
    "Sharing stopped",
    expect.objectContaining({ description: expect.stringContaining("dead") }),
  )
})

test("regenerating swaps the token in the cache", async () => {
  serverMocks.regenerateShareToken.mockResolvedValue({
    token: "tok-2",
    audience: "members",
  })
  const { queryClient, hook } = setup(
    () => useRegenerateShareToken(drawingId),
    { token: "tok-1", audience: "members" },
  )

  act(() => hook.current.mutate())
  await flush()

  expect(queryClient.getQueryData<Share>(shareKey)?.token).toBe("tok-2")
  expect(toastMock).toHaveBeenCalledWith("Link regenerated", expect.anything())
})

test("audience change is optimistic and rolls back when the server refuses", async () => {
  let reject: (e: Error) => void = () => {}
  serverMocks.setShareAudience.mockReturnValue(
    new Promise((_resolve, rej) => {
      reject = rej
    }),
  )
  const { queryClient, hook } = setup(() => useSetShareAudience(drawingId), {
    token: "tok-1",
    audience: "members",
  })

  act(() => hook.current.mutate("anyone"))
  await flush()
  // Flipped before the server answered.
  expect(queryClient.getQueryData<Share>(shareKey)?.audience).toBe("anyone")

  act(() => reject(new Error("Drawing is not shared")))
  await flush()
  // Rolled back, and the user heard about it.
  expect(queryClient.getQueryData<Share>(shareKey)?.audience).toBe("members")
  expect(toastMock.error).toHaveBeenCalledWith("Drawing is not shared")
})
