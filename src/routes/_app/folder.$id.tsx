import { createFileRoute, redirect } from "@tanstack/react-router"
import { foldersQueryOptions } from "@/features/folders/queries"
import { FolderPage } from "./-components/FolderPage"

// The folders query is owner-scoped, so an unknown id and another owner's id
// look identical here — both land on /drawings, never an error screen.
export const Route = createFileRoute("/_app/folder/$id")({
  loader: async ({ context, params }) => {
    const folders = await context.queryClient.ensureQueryData(
      foldersQueryOptions(),
    )
    if (!folders.some((folder) => folder.id === params.id)) {
      throw redirect({ to: "/drawings" })
    }
  },
  component: FolderRoute,
})

function FolderRoute() {
  const { id } = Route.useParams()
  // Keyed so search/sort reset when hopping between folders
  return <FolderPage key={id} folderId={id} />
}
