import { redirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { getRequest, getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "@/lib/auth"

export const authMiddleware = createMiddleware().server(async ({ next }) => {
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })
  if (!session) {
    throw redirect({
      to: "/login",
      search: { redirect: returnPath() },
      statusCode: 302,
    })
  }
  return await next({
    context: {
      session,
    },
  })
})

// Server-fn calls hit RPC URLs, not pages — there's nothing to return the
// user to, so only page requests carry a ?redirect back to /login.
function returnPath(): string | undefined {
  const request = getRequest()
  if (request.headers.get("x-tsr-serverFn") === "true") return undefined
  const url = new URL(request.url)
  return url.pathname + url.search
}
