import { fileURLToPath, URL } from "node:url"
import tailwindcss from "@tailwindcss/vite"
import { devtools } from "@tanstack/devtools-vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import viteReact from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"

const config = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    tailwindcss(),
    devtools(),
    nitro({
      rolldownConfig: {
        checks: {
          // The server bundle inlines client libraries; their "use client"
          // directives mean nothing there and Rolldown warns on each one.
          moduleLevelDirective: false,
          // Nitro's chunk groups have no debugName, so the timing report
          // only adds a warning about the missing label.
          bundlerTimings: false,
        },
      },
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
