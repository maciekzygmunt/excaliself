import { createFileRoute, getRouteApi } from "@tanstack/react-router"
import { Home } from "./-components/home/Home"

const layoutRoute = getRouteApi("/draw")

// SSR is on: the layout loader has already ensured drawings/folders, so the
// card grid arrives as server HTML. Previews still render client-side —
// Home defers its @excalidraw/excalidraw import to the browser.
export const Route = createFileRoute("/draw/")({
  component: HomeRoute,
})

function HomeRoute() {
  const { isAdmin } = layoutRoute.useLoaderData()
  return <Home isAdmin={isAdmin} />
}
