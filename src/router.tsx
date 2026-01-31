import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
// Import the generated route tree
import { routeTree } from "./routeTree.gen"

// Create a new router instance
export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 1000 * 60 * 5, // 5 min
        gcTime: 1000 * 60 * 60, // 1 hour
        refetchOnWindowFocus: false,
      },
    },
  })

  const router = createRouter({
    routeTree,
    context: {
      queryClient,
    },

    defaultPreload: "intent",
  })

  setupRouterSsrQueryIntegration({ router, queryClient })

  return router
}
