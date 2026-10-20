import { createEnv } from "@t3-oss/env-core"
import { z } from "zod"

// Accepts true/false, 1/0, yes/no, on/off.
const flag = () => z.stringbool().default(false)

// Read up front because the flag decides the shape of the schema below.
// Empty string counts as unset, matching emptyStringAsUndefined.
const previewMode = flag().parse(process.env.PREVIEW_MODE || undefined)

export const env = createEnv({
  server: {
    // Preview runs on an in-process PGlite. Coolify may still hand it the
    // production value, which it ignores.
    DATABASE_URL: previewMode ? z.url().optional() : z.url(),
    // Preview sessions only guard dummy data, and a PR branch must not need
    // production credentials.
    BETTER_AUTH_SECRET: previewMode
      ? z.string().min(32).default("preview-only-secret-not-for-production")
      : z.string().min(32, {
          message: "BETTER_AUTH_SECRET must be at least 32 characters",
        }),
    BASE_URL: z.url().optional(),
    PREVIEW_MODE: flag(),
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
    // Where the Excalidraw+ import calls the public API. Override it only to
    // test against a fake server.
    EXCALIDRAW_PLUS_API_URL: z.url().default("https://api.excalidraw.com"),
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
