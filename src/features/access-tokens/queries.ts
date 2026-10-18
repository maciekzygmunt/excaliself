import { queryOptions } from "@tanstack/react-query"
import { getAccessTokens } from "./server"

export type AccessToken = Awaited<ReturnType<typeof getAccessTokens>>[number]

export const accessTokensQueryOptions = () =>
  queryOptions({
    queryKey: ["account", "accessTokens"] as const,
    queryFn: () => getAccessTokens(),
  })
