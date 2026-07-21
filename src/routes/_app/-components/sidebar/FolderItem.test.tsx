import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { type ReactNode, useState } from "react"
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest"
import { SidebarProvider } from "@/components/ui/sidebar"
import type { Folder } from "@/features/folders/queries"
import { CreateDialogProvider } from "../CreateDialog"
import { FolderItem } from "./FolderItem"
import type { TreeNode } from "./tree"
import { SidebarDnDProvider } from "./use-sidebar-dnd"

vi.mock("@tanstack/react-router", () => ({
  useParams: () => ({}),
  useNavigate: () => vi.fn(),
}))

vi.mock("@/features/folders/server", () => ({
  getFolders: vi.fn(),
  createFolder: vi.fn(),
  updateFolder: vi.fn(),
  trashFolder: vi.fn(),
  restoreFolder: vi.fn(),
}))

vi.mock("@/features/drawings/server", () => ({
  getDrawings: vi.fn(),
  getDrawingWithFiles: vi.fn(),
  createDrawing: vi.fn(),
  updateDrawing: vi.fn(),
  setDrawingStarred: vi.fn(),
  saveDrawingScene: vi.fn(),
  trashDrawing: vi.fn(),
  restoreDrawing: vi.fn(),
}))

// SidebarProvider's useIsMobile needs matchMedia, which jsdom doesn't provide.
beforeAll(() => {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
})

afterAll(() => vi.unstubAllGlobals())

// Auto-cleanup needs vitest globals, which this repo leaves off; without it
// Radix portals from the previous test linger in document.body.
afterEach(cleanup)

function makeFolder(
  id: string,
  name: string,
  parentId: string | null = null,
): Folder {
  return {
    id,
    name,
    ownerId: "user-1",
    parentId,
    deletedAt: null,
    trashRootId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient())
  return (
    <QueryClientProvider client={client}>
      <SidebarProvider>
        <CreateDialogProvider>
          <SidebarDnDProvider drawings={[]} foldersById={new Map()}>
            {children}
          </SidebarDnDProvider>
        </CreateDialogProvider>
      </SidebarProvider>
    </QueryClientProvider>
  )
}

function renderFolder(folder: Folder, childNodes: TreeNode[]) {
  const view = render(<FolderItem folder={folder} childNodes={childNodes} />, {
    wrapper: Providers,
  })
  return {
    ...view,
    rerenderFolder: (nextChildren: TreeNode[]) =>
      view.rerender(<FolderItem folder={folder} childNodes={nextChildren} />),
  }
}

function rowState() {
  const row = document.querySelector('[data-slot="collapsible-trigger"]')
  if (!(row instanceof HTMLElement)) throw new Error("trigger row not found")
  return row.hasAttribute("data-panel-open") ? "open" : "closed"
}

const childNode = (folder: Folder): TreeNode => ({
  type: "folder",
  folder,
  children: [],
})

test("an empty folder renders no collapsible and clicking it is inert", () => {
  renderFolder(makeFolder("f1", "Empty folder"), [])

  fireEvent.click(screen.getByText("Empty folder"))

  // An empty folder gets no collapsible machinery at all: no trigger
  // announcing a disclosure (aria-expanded/aria-controls pointing at nothing)
  // and no content to pulse open and shut.
  expect(document.querySelector('[data-slot="collapsible-trigger"]')).toBeNull()
  expect(document.querySelector('[data-slot="collapsible-content"]')).toBeNull()
  // The row button itself (not the actions menu) must not announce a disclosure
  const rowButton = document.querySelector('[data-sidebar="menu-button"]')
  if (!rowButton) throw new Error("folder row button not found")
  expect(rowButton.getAttribute("aria-expanded")).toBeNull()
})

test("clicking a folder with children still expands and collapses it", () => {
  renderFolder(makeFolder("f1", "Parent folder"), [
    childNode(makeFolder("f2", "Child folder", "f1")),
  ])

  expect(screen.queryByText("Child folder")).toBeNull()

  fireEvent.click(screen.getByText("Parent folder"))
  expect(rowState()).toBe("open")
  expect(screen.getByText("Child folder")).toBeTruthy()

  fireEvent.click(screen.getByText("Parent folder"))
  // Base UI keeps the content mounted for the exit animation; the state flips
  expect(rowState()).toBe("closed")
})

test("dropping onto an empty folder marks it expanded for when children arrive", () => {
  const folder = makeFolder("f1", "Drop target")
  const { rerenderFolder } = renderFolder(folder, [])

  const dataTransfer = { effectAllowed: "", dropEffect: "", setData: vi.fn() }
  const label = screen.getByText("Drop target")
  fireEvent.dragStart(label, { dataTransfer })
  fireEvent.drop(label, { dataTransfer })

  // The drop itself is a no-op (a folder can't move into itself), but the
  // row must remember it was targeted so it opens once it gains children.
  rerenderFolder([childNode(makeFolder("f2", "Dropped child", "f1"))])
  expect(rowState()).toBe("open")
  expect(screen.getByText("Dropped child")).toBeTruthy()
})
