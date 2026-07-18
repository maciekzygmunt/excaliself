import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

export const env = createEnv({
  server: {
    DATABASE_URL: z.url(),
    BETTER_AUTH_SECRET: z.string().min(32, {
      message: "BETTER_AUTH_SECRET must be at least 32 characters",
    }),
    BASE_URL: z.url().optional(),
  },
  clientPrefix: "VITE_",
  client: {
    VITE_APP_TITLE: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  // Treat empty strings in .env files (e.g. `FOO=`) as missing rather than ""
  // so optional vars and defaults behave as expected.
  emptyStringAsUndefined: true,
})
