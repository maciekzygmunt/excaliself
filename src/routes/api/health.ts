import { createFileRoute } from "@tanstack/react-router"
import { sql } from "drizzle-orm"
import { db } from "@/db"

// Unauthenticated probe endpoint for Coolify/uptime/container healthchecks.
// Healthy means the app is serving requests and Postgres answers a round-trip.
export async function healthHandler(): Promise<Response> {
  try {
    await db.execute(sql`SELECT 1`)
    return Response.json({ status: "ok" })
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 })
  }
}

export const Route = createFileRoute("/api/health")({
  server: {
    handlers: {
      GET: healthHandler,
    },
  },
})
