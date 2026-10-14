import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { validateSpaceSearch } from "@/features/spaces/browse"
import { AllDrawings } from "./-components/AllDrawings"

const layoutRoute = getRouteApi("/_app")

// SSR is on: the layout loader has already ensured drawings/folders, so the
// gallery arrives as server HTML. Previews still render client-side —
// the gallery defers its @excalidraw/excalidraw import to the browser.
export const Route = createFileRoute("/_app/drawings")({
  validateSearch: validateSpaceSearch,
  component: DrawingsRoute,
})

function DrawingsRoute() {
  const { isAdmin } = layoutRoute.useLoaderData()
  return <AllDrawings isAdmin={isAdmin} />
}
