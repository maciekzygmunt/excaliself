import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/")({
  // Home lives at /draw (the canvas area with no drawing open); the app
  // never creates or picks a drawing on the user's behalf.
  loader: () => {
    throw redirect({ to: "/draw", statusCode: 301 })
  },
  component: () => null,
})
