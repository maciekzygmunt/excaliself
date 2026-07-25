import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import viteTsConfigPaths from "vite-tsconfig-paths"

const config = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    devtools(),
    // `serverDir` turns on nitro's own file-based routing for the room
    // websocket (the app's pages stay with TanStack Start); `features.websocket`
    // wires the upgrade onto the app's existing port — no new ports, no new
    // env vars. Do NOT upgrade TanStack Start past this pinned nitro plugin
    // without re-running docs/collab-websocket-smoke-test.md in both dev and
    // the built container.
    nitro({ serverDir: "server", features: { websocket: true } }),
    viteTsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart({
      router: {
        // Keep co-located *.test.tsx files out of route scanning so the
        // generator does not warn that they "do not export a Route".
        routeFileIgnorePattern: "\\.test\\.",
      },
    }),
    viteReact(),
  ],
})

export default config
