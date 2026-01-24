import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch"
import { auth } from "@/lib/auth"
import { getDb } from "@/lib/db"

export async function createContext({ req }: FetchCreateContextFnOptions) {
  const db = getDb()
  const session = await auth.api.getSession({ headers: req.headers })

  return {
    db,
    session,
    req,
  }
}

export type Context = Awaited<ReturnType<typeof createContext>>
