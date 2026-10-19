import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"
import { instanceMode } from "@/lib/mode"

// PREVIEW_MODE and DEMO_MODE are read in lib/mode.ts: the mode decides the
// shape of the schema below.

export const env = createEnv({
  server: {
    // Preview runs on an in-process PGlite. Coolify may still hand it the
    // production value, which it ignores.
    DATABASE_URL: instanceMode === "standard" ? z.url() : z.url().optional(),
    // Preview sessions only guard dummy data, and a PR branch must not need
    // production credentials. The demo is public, so it needs a real secret.
    BETTER_AUTH_SECRET:
      instanceMode === "preview"
        ? z.string().min(32).default("preview-only-secret-not-for-production")
        : z.string().min(32, {
            message: "BETTER_AUTH_SECRET must be at least 32 characters",
          }),
    BASE_URL: z.url().optional(),
    // Comma-separated host patterns a preview answers on, e.g.
    // "*.draw.example.com". Auth refuses any other host.
    PREVIEW_HOSTS: z
      .string()
      .transform((list) =>
        list
          .split(",")
          .map((host) => host.trim())
          .filter(Boolean),
      )
      .default([]),
    // Demo accounts and their drawings are deleted this long after sign-up.
    DEMO_RETENTION_HOURS: z.coerce.number().positive().default(6),
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
