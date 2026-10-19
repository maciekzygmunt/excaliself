import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { AnchorHTMLAttributes } from "react"
import { afterEach, expect, test, vi } from "vitest"
import { currentUserQueryOptions } from "@/features/account/queries"
import {
  importExcalidrawPlusScene,
  scanExcalidrawPlus,
} from "@/features/excalidraw-plus/server"
import { ImportSection } from "./ImportSection"

// The query modules import the server functions, which import the db.
vi.mock("@/features/account/server", () => ({}))
vi.mock("@/features/drawings/server", () => ({}))
vi.mock("@/features/folders/server", () => ({}))
vi.mock("@/features/excalidraw-plus/server", () => ({
  scanExcalidrawPlus: vi.fn(),
  importExcalidrawPlusScene: vi.fn(),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { to: string }) => (
    <a href={to} {...props} />
  ),
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const scene = (id: string, imported = false) => ({
  id,
  name: `Scene ${id}`,
  pinned: false,
  collection: { id: "col", name: "Docs" },
  imported,
})

async function scanAndImport(scenes: ReturnType<typeof scene>[]) {
  vi.mocked(scanExcalidrawPlus).mockResolvedValue({
    keyType: "personal",
    scenes,
  })
  const queryClient = new QueryClient()
  queryClient.setQueryData(currentUserQueryOptions().queryKey, {
    teamEnabled: true,
  } as never)
  render(
    <QueryClientProvider client={queryClient}>
      <ImportSection />
    </QueryClientProvider>,
  )
  fireEvent.change(screen.getByLabelText("Excalidraw+ API key"), {
    target: { value: "uk-key" },
  })
  fireEvent.click(screen.getByRole("button", { name: "Find scenes" }))
  fireEvent.click(await screen.findByRole("button", { name: /^Import / }))
  await screen.findByRole("link", { name: "Open drawings" })
}

const importedIds = () =>
  vi
    .mocked(importExcalidrawPlusScene)
    .mock.calls.map(([call]) => call.data.scene.id)

test("imports each new scene and keeps going past a failed one", async () => {
  vi.mocked(importExcalidrawPlusScene)
    .mockResolvedValueOnce({
      status: "imported",
      space: "team",
      skippedImages: 1,
    })
    .mockRejectedValueOnce(new Error("Excalidraw+ answered 500: boom"))
    .mockResolvedValueOnce({
      status: "imported",
      space: "team",
      skippedImages: 0,
    })

  await scanAndImport([scene("a"), scene("old", true), scene("b"), scene("c")])

  expect(importedIds()).toEqual(["a", "b", "c"])
  expect(screen.getByText("Imported 2 scenes.")).toBeTruthy()
  expect(screen.getByText(/Excalidraw\+ answered 500: boom/)).toBeTruthy()
  expect(screen.getByText(/1 image could not be brought over/)).toBeTruthy()
})

test("stops at once when Excalidraw+ rejects the key", async () => {
  vi.mocked(importExcalidrawPlusScene).mockRejectedValue(
    new Error("Excalidraw+ didn't accept this key"),
  )

  await scanAndImport([scene("a"), scene("b")])

  expect(importedIds()).toEqual(["a"])
  expect(screen.getByText("Stopped. Imported 0 scenes.")).toBeTruthy()
})
