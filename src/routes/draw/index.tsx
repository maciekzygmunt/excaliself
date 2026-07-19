import { createFileRoute } from "@tanstack/react-router"
import { Home } from "./-components/home/Home"

export const Route = createFileRoute("/draw/")({
  // Previews render client-side from cached scene data, same as the canvas
  ssr: false,
  component: Home,
})
