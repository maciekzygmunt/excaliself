import { randomUUID } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { demoAdmin } from "@/db/demo-content"
import { insertPreviewUser } from "@/db/preview-seed"
import { instanceMode } from "@/lib/mode"
import { resolveRedirect } from "@/lib/redirects"
import { signInAndRedirect } from "@/lib/sign-in-redirect"

// One-click sign-in for PR previews: as the seeded admin, or with
// ?account=new as a member made for this click, so testers do not share one
// account's state. Lands on ?redirect= like /login does. 404 outside preview,
// and in the demo, which has /demo.
async function signInToPreview(request: Request) {
  if (instanceMode !== "preview") {
    return new Response("Not found", { status: 404 })
  }
  const params = new URL(request.url).searchParams
  const isNew = params.get("account") === "new"
  return signInAndRedirect(
    request,
    isNew ? await createMember() : demoAdmin,
    resolveRedirect(params.get("redirect") ?? undefined),
  )
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
