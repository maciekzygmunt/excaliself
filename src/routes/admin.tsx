import { createFileRoute, redirect } from "@tanstack/react-router"

// The admin surface moved under Settings (issue #64); the old URL redirects
// permanently for bookmarks and muscle memory. Gating lives on the target
// routes, so non-admins bounce onward from there.
export const Route = createFileRoute("/admin")({
  loader: () => {
    throw redirect({ to: "/settings/members", statusCode: 301 })
  },
  component: () => null,
})
