import { fileURLToPath, URL } from "node:url"
import { defineConfig } from "vitest/config"

// Standalone config: the app's vite.config.ts loads the full TanStack
// Start/Nitro plugin stack, which unit tests don't need.
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
  },
})
