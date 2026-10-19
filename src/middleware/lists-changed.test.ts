import { expect, test, vi } from "vitest"
import { listUpdates } from "@/features/list-updates/hub"

vi.mock("@tanstack/react-start", () => ({
  createMiddleware: () => ({
    server: (server: unknown) => ({ options: { server } }),
  }),
}))

type ServerHandler = (ctx: { next: () => Promise<unknown> }) => Promise<unknown>

const { listsChangedMiddleware } = await import("./lists-changed")
const handler = (
  listsChangedMiddleware as unknown as { options: { server: ServerHandler } }
).options.server

test("a successful write tells the open tabs, after the handler", async () => {
  const notify = vi.spyOn(listUpdates, "notify")
  const next = vi.fn(async () => {
    expect(notify).not.toHaveBeenCalled()
    return "result"
  })

  await expect(handler({ next })).resolves.toBe("result")
  expect(notify).toHaveBeenCalledOnce()
  notify.mockRestore()
})

test("a failed write tells nobody", async () => {
  const notify = vi.spyOn(listUpdates, "notify")

  await expect(
    handler({ next: () => Promise.reject(new Error("Folder not found")) }),
  ).rejects.toThrow("Folder not found")
  expect(notify).not.toHaveBeenCalled()
  notify.mockRestore()
})
