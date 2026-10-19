import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { DEMO_LIMITS } from "@/features/demo/policy"
import { createDemoVisitor } from "@/features/demo/visitors"
import { auth } from "@/lib/auth"
import { clientIpKey, socketIpOf } from "@/lib/client-ip"
import { instanceMode } from "@/lib/mode"
import { processSingleton } from "@/lib/process-singleton"
import { createRateLimiter } from "@/lib/rate-limit"
import { resolveRedirect } from "@/lib/redirects"
import { signInAndRedirect } from "@/lib/sign-in-redirect"

const signUps = processSingleton("demo-sign-up-rate-limit", () =>
  createRateLimiter({
    limit: DEMO_LIMITS.accountsPerIpPerHour,
    windowMs: 60 * 60 * 1000,
  }),
)

// The demo's front door: signs the visitor in to a new member account with
// its own example content. A visitor with a live session keeps it, so a
// second click does not lose their work. 404 outside demo mode.
async function startDemo(request: Request) {
  if (instanceMode !== "demo") return new Response("Not found", { status: 404 })

  const redirectParam = new URL(request.url).searchParams.get("redirect")
  const location = resolveRedirect(redirectParam ?? undefined)
  if (await auth.api.getSession({ headers: request.headers })) {
    return new Response(null, { status: 302, headers: { location } })
  }

  const ip = clientIpKey({
    headers: request.headers,
    socketIp: socketIpOf(request),
  })
  if (!signUps.allow(ip, Date.now())) {
    return new Response(
      "Too many demo accounts were made from your network. Try again in an hour.",
      { status: 429 },
    )
  }
  return signInAndRedirect(request, await createDemoVisitor(db), location)
}

export const Route = createFileRoute("/demo")({
  server: {
    handlers: {
      GET: ({ request }) => startDemo(request),
    },
  },
})
