import { QueryClient } from "@tanstack/react-query"
import { beforeEach, expect, test, vi } from "vitest"
import type { Folder } from "@/features/folders/queries"
import { foldersQueryOptions } from "@/features/folders/queries"

const redirect = vi.fn((opts: unknown) => ({ isRedirect: true, opts }))

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  redirect,
}))

// The page components pull in the whole app-shell tree — the loader guard
// under test never touches them.
vi.mock("./-components/FolderPage", () => ({
  FolderPage: () => null,
}))

vi.mock("./-components/FolderPaletteContext", () => ({
  FolderPaletteContext: () => null,
}))

vi.mock("@/features/folders/server", () => ({
  getFolders: vi.fn(),
}))

beforeEach(() => {
  redirect.mockClear()
})

type Loader = (args: {
  context: { queryClient: QueryClient }
  params: { id: string }
}) => Promise<void>

async function loadLoader() {
  const { Route } = await import("./folder.$id")
  return (Route as unknown as { options: { loader: Loader } }).options.loader
}

function seededClient(folders: Folder[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false } },
  })
  client.setQueryData(foldersQueryOptions().queryKey, folders)
  return client
}

const projects: Folder = {
  id: "f1",
  name: "Projects",
  space: "private",
  createdBy: "user-1",
  deletedBy: null,
  parentId: null,
  deletedAt: null,
  trashRootId: null,
  createdAt: new Date(0),
  updatedAt: new Date(0),
}

test("a folder the user owns loads without redirecting", async () => {
  const loader = await loadLoader()

  await loader({
    context: { queryClient: seededClient([projects]) },
    params: { id: "f1" },
  })

  expect(redirect).not.toHaveBeenCalled()
})

// The folders query is owner-scoped, so an unknown id and another owner's id
// are the same case: not in the list.
test("an unknown or other-owner folder id lands on /drawings", async () => {
  const loader = await loadLoader()

  await expect(
    loader({
      context: { queryClient: seededClient([projects]) },
      params: { id: "someone-elses-folder" },
    }),
  ).rejects.toMatchObject({ isRedirect: true })
  expect(redirect).toHaveBeenCalledWith({ to: "/drawings" })
})
