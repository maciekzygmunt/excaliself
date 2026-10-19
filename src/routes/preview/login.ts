import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { APIError } from "better-auth/api"
import { db } from "@/db"
import { demoAdmin } from "@/db/demo-content"
import { insertPreviewUser } from "@/db/preview-seed"
import { env } from "@/env"
import { auth } from "@/lib/auth"
import { resolveRedirect } from "@/lib/redirects"

// One-click sign-in for PR previews: as the seeded admin, or with
// ?account=new as a member made for this click, so testers do not share one
// account's state. Goes through better-auth's own sign-in, so the session is
// a real one. Lands on ?redirect= like /login does. 404 outside preview.
async function signInToPreview(request: Request) {
  if (!env.PREVIEW_MODE) return new Response("Not found", { status: 404 })

  const params = new URL(request.url).searchParams
  const isNew = params.get("account") === "new"
  const { email, password } = isNew ? await createMember() : demoAdmin
  try {
    const { headers } = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      returnHeaders: true,
    })
    const redirect = new Headers({
      location: resolveRedirect(params.get("redirect") ?? undefined),
    })
    for (const cookie of headers.getSetCookie()) {
      redirect.append("set-cookie", cookie)
    }
    return new Response(null, { status: 302, headers: redirect })
  } catch (error) {
    // Most likely a host outside PREVIEW_HOSTS; better-auth names it.
    if (error instanceof APIError) {
      return new Response(error.message, { status: 400 })
    }
    throw error
  }
}

async function createMember() {
  const id = randomUUID()
  const member = {
    id,
    name: "Preview tester",
    email: `tester-${id.slice(0, 8)}@example.com`,
    password: demoAdmin.password,
    role: "user" as const,
  }
  await insertPreviewUser(db, member)
  return member
}

export const Route = createFileRoute("/preview/login")({
  server: {
    handlers: {
      GET: ({ request }) => signInToPreview(request),
    },
  },
})
