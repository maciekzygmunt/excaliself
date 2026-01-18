import type { auth } from "@/lib/auth"
import type { getDb } from "@/lib/db"

type Db = ReturnType<typeof getDb>

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        db: Db
        auth: typeof auth
        request: Request
      }
    }
  }
}
