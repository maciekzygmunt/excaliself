import { createFileRoute, redirect } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "@/lib/auth"

// A plain session probe — unlike authMiddleware, it must not redirect on
// its own, because / routes both auth states itself.
const getIsAuthed = createServerFn({ method: "GET" }).handler(async () => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  return session !== null
})

export const Route = createFileRoute("/")({
  // Home lives at /draw (the canvas area with no drawing open); the app
  // never creates or picks a drawing on the user's behalf.
  loader: async () => {
    if (await getIsAuthed()) {
      throw redirect({ to: "/draw", statusCode: 301 })
    }
    throw redirect({ to: "/login", statusCode: 302 })
  },
  component: () => null,
})
