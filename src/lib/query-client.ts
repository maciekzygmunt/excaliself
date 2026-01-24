import { QueryClient } from "@tanstack/react-query"
import { httpBatchLink } from "@trpc/client"
import { trpc } from "./trpc/client"

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function getBaseUrl() {
  if (typeof window !== "undefined") {
    return ""
  }
  return "http://localhost:3000"
}

export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: `${getBaseUrl()}/api/trpc`,
    }),
  ],
})
