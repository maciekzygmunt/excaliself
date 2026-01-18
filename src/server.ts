import type { Register } from "@tanstack/react-start"
import type { RequestHandler } from "@tanstack/react-start/server"
import {
  createStartHandler,
  defaultStreamHandler,
} from "@tanstack/react-start/server"
import { createServerEntry } from "@tanstack/react-start/server-entry"
import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"
import * as drawings from "@/server/drawings"
import * as invites from "@/server/invites"
import * as users from "@/server/users"

const db = getDb()
const baseFetch = createStartHandler(defaultStreamHandler)

const fetch: RequestHandler<Register> = (request, opts) => {
  const baseContext = (opts?.context ?? {}) as Record<string, unknown>
  const context = {
    ...baseContext,
    db,
    auth,
    users,
    drawings,
    invites,
    request,
  }

  return baseFetch(request, {
    ...opts,
    context,
  })
}

export default createServerEntry({ fetch })
