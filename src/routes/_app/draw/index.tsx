import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { validateSpaceSearch } from "@/features/spaces/browse"
import { Home } from "../-components/home/Home"

const layoutRoute = getRouteApi("/_app")

// SSR is on: the layout loader has already ensured drawings/folders, so the
// card grid arrives as server HTML. Previews still render client-side —
// Home defers its @excalidraw/excalidraw import to the browser.
export const Route = createFileRoute("/_app/draw/")({
  validateSearch: validateSpaceSearch,
  component: HomeRoute,
})

function HomeRoute() {
  const { isAdmin } = layoutRoute.useLoaderData()
  return <Home isAdmin={isAdmin} />
}
