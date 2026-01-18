import type { auth } from "@/lib/auth"
import type { getDb } from "@/lib/db"
import type * as drawings from "@/server/drawings"
import type * as invites from "@/server/invites"
import type * as users from "@/server/users"

type Db = ReturnType<typeof getDb>

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        db: Db
        auth: typeof auth
        drawings: typeof drawings
        invites: typeof invites
        users: typeof users
        request: Request
      }
    }
  }
}
