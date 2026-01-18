import { inferAdditionalFields } from "better-auth/client/plugins"
import { createAuthClient } from "better-auth/react"
import type { auth } from "@/lib/auth"

export const authClient = createAuthClient({
  baseURL:
    typeof window !== "undefined"
      ? window.location.origin
      : process.env.BASE_URL,
  plugins: [inferAdditionalFields<typeof auth>()],
})

export const { signIn, signOut, signUp, useSession } = authClient
