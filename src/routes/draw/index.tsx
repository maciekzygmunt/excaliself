import { createFileRoute } from "@tanstack/react-router"
import { Home } from "./-components/home/Home"

// SSR is on: the layout loader has already ensured drawings/folders, so the
// card grid arrives as server HTML. Previews still render client-side —
// Home defers its @excalidraw/excalidraw import to the browser.
export const Route = createFileRoute("/draw/")({
  component: Home,
})
