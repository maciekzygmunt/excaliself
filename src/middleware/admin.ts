import { redirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { eq } from "drizzle-orm"
import { db } from "@/db"
import { users } from "@/db/schema"
import { authMiddleware } from "./auth"

// The role rides the session's cookie cache for up to five minutes, so a
// just-demoted admin would keep admin access until it expires. Read the role
// fresh — role checks must hold the moment a demotion lands (issue #65).
export const adminMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const { session } = context
    const [user] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.id, session.user.id))
    if (user?.role !== "admin") {
      throw redirect({ to: "/" })
    }
    return await next({
      context: {
        session,
      },
    })
  })
