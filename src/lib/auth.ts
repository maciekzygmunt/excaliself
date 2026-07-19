import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { tanstackStartCookies } from "better-auth/tanstack-start"
import { db } from "@/db"
import * as schema from "@/db/schema"
import { env } from "@/env"

export const auth = betterAuth({
  // Public origin when behind a reverse proxy; better-auth infers from the
  // request when unset.
  baseURL: env.BASE_URL,
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
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 60 * 5,
    },
  },
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
  plugins: [tanstackStartCookies()],
})
