"use server"

import { createServerFn } from "@tanstack/react-start"
import { env } from "@/env"

// The login page shows one-click preview sign-in links when this is true.
export const getPreviewMode = createServerFn({ method: "GET" }).handler(
  () => env.PREVIEW_MODE,
)
