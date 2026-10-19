import { createMiddleware } from "@tanstack/react-start"
import { listUpdates } from "@/features/list-updates/hub"

/**
 * For server functions that change the drawing, folder, or trash lists:
 * once the handler succeeds, every open tab refetches them. A throw skips it.
 * Scene saves don't use it; the lists' poll covers those.
 */
export const listsChangedMiddleware = createMiddleware().server(
  async ({ next }) => {
    const result = await next()
    listUpdates.notify()
    return result
  },
)
