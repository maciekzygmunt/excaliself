import type { getDb } from "@/lib/db"

type Db = ReturnType<typeof getDb>

declare module "@tanstack/react-start" {
  interface Register {
    server: {
      requestContext: {
        db: Db
        request: Request
      }
    }
  }
}
