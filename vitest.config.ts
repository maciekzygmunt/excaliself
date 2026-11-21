import { fileURLToPath, URL } from "node:url"
import { paraglideVitePlugin } from "@inlang/paraglide-js"
import { defineConfig } from "vitest/config"

// Standalone config: the app's vite.config.ts loads the full TanStack
// Start/Nitro plugin stack, which unit tests don't need.
export default defineConfig({
  plugins: [
    paraglideVitePlugin({
      project: "./project.inlang",
      outdir: "./src/paraglide",
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["./src/test-setup.ts"],
    // Transformed by Vite, whose resolver handles its extensionless ESM
    // imports, so a test can load the real package where it must.
    server: { deps: { inline: ["@excalidraw/excalidraw"] } },
  },
})
