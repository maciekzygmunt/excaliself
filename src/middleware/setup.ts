import { redirect } from "@tanstack/react-router"
import { createMiddleware } from "@tanstack/react-start"
import { getUserCount } from "@/server/users"

export const setupMiddleware = createMiddleware().server(async ({ next }) => {
  const userCount = await getUserCount()
  if (userCount === 0) {
    throw redirect({ to: "/setup" })
  }
  return await next()
})
