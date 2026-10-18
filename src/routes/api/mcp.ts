// The MCP endpoint (Streamable HTTP) a member's AI client connects to.
//
// Auth is an access token only, never the session cookie: another site can
// make a browser send the cookie, but it can't know a token. That is also
// why no Origin check is needed.

import { createMcpHandler } from "@modelcontextprotocol/server"
import { createFileRoute } from "@tanstack/react-router"
import { db } from "@/db"
import { env } from "@/env"
import { memberForToken } from "@/features/access-tokens/tokens"
import { createMcpServer, type Member } from "@/features/mcp/tools"
import { resolveOrigin } from "@/lib/site-origin"

type Caller = { member: Member; origin: string }

// Stateless: every request gets a fresh server for the member it carries.
const handler = createMcpHandler(({ authInfo }) => {
  // mcpHandler always passes authInfo, so a missing one is a bug.
  if (!authInfo?.extra) throw new Error("MCP request without a caller")
  const { member, origin } = authInfo.extra as Caller
  return createMcpServer(db, member, origin)
})

function unauthorized(): Response {
  return Response.json(
    {
      error: "invalid_token",
      error_description:
        "Send an Excaliself access token as Authorization: Bearer <token>. Make one in Settings, under Access tokens.",
    },
    {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="excaliself"' },
    },
  )
}

export async function mcpHandler(request: Request): Promise<Response> {
  const token = request.headers
    .get("authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1]
  const member = token ? await memberForToken(db, token) : null
  if (!token || !member) return unauthorized()

  const caller: Caller = {
    member,
    origin: resolveOrigin({
      baseUrl: env.BASE_URL,
      headers: request.headers,
      requestUrl: request.url,
    }),
  }
  return handler.fetch(request, {
    authInfo: { token, clientId: "access-token", scopes: [], extra: caller },
  })
}

export const Route = createFileRoute("/api/mcp")({
  server: {
    handlers: {
      GET: ({ request }) => mcpHandler(request),
      POST: ({ request }) => mcpHandler(request),
      DELETE: ({ request }) => mcpHandler(request),
    },
  },
})
