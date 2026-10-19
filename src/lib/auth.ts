import { type BetterAuthOptions, betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { env } from "@/env"

type DynamicBaseURL = Exclude<NonNullable<BetterAuthOptions["baseURL"]>, string>

// Each PR preview has its own host (42.draw.example.com), so its base URL
// comes from each request, limited to PREVIEW_HOSTS. A fixed one would also
// let a production BASE_URL copied into the preview take effect. Localhost
// covers `pnpm dev:preview`.
const previewBaseURL: DynamicBaseURL = {
  allowedHosts: [
    ...env.PREVIEW_HOSTS,
    "localhost",
    "localhost:*",
    "127.0.0.1",
    "127.0.0.1:*",
  ],
  protocol: "auto",
}

export const auth = betterAuth({
  // Public origin when behind a reverse proxy; better-auth infers from the
  // request when unset.
  baseURL: env.PREVIEW_MODE ? previewBaseURL : env.BASE_URL,
  // Read from env.ts, which gives preview a default.
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  emailAndPassword: {
    enabled: true,
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      // Registration is invite-only. Accounts are created server-side via
      // registerWithInvite/setupAdmin, which call auth.api.signUpEmail
      // directly (no ctx.request). Block the public HTTP endpoint, which
      // would otherwise let anyone self-register past the invite check.
      if (ctx.path === "/sign-up/email" && ctx.request) {
        throw new APIError("FORBIDDEN", {
          message: "Sign-up is invite-only",
        })
      }
    }),
  },
  // No cookie cache: every request reads the session row, so a deleted or
  // signed-out member loses access at once.
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "user",
        input: false,
        returned: true,
      },
    },
  },
  advanced: {
    // Preview sits behind Coolify's proxy, whose x-forwarded-proto makes the
    // derived scheme https. allowedHosts bounds a forged x-forwarded-host.
    trustedProxyHeaders: env.PREVIEW_MODE,
  },
  plugins: [tanstackStartCookies()],
})
