import { redirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { authMiddleware } from "./auth"

export const adminMiddleware = createMiddleware()
  .middleware([authMiddleware])
  .server(async ({ next, context }) => {
    const { session } = context
    if (session.user.role !== "admin") {
      throw redirect({ to: "/" })
    }
    return await next({
      context: {
        session,
      },
    })
  })
