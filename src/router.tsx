import { QueryClient } from "@tanstack/react-query"
import { createRouter } from "@tanstack/react-router"
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query"
import { QUERY_GC_TIME_MS, QUERY_STALE_TIME_MS } from "./lib/constants"
import { routeTree } from "./routeTree.gen"

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: QUERY_STALE_TIME_MS,
        gcTime: QUERY_GC_TIME_MS,
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
