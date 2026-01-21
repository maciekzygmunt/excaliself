import { redirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { getRequestHeaders } from "@tanstack/react-start/server"
import { auth } from "@/lib/auth"
import { getUserCount } from "@/server/users"

export const adminMiddleware = createMiddleware().server(async ({ next }) => {
  const userCount = await getUserCount()
  const headers = getRequestHeaders()
  const session = await auth.api.getSession({ headers })

  if (userCount === 0 || session?.user.role !== "admin") {
    throw redirect({ to: "/setup" })
  }

  return await next()
})
