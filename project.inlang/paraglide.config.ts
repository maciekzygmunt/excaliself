import { defineConfig } from "@inlang/paraglide-js"

// Read by the Vite plugin and by `paraglide-js compile`.
export default defineConfig({
  outdir: "./src/paraglide",
  // Both custom strategies are in src/lib/language.ts. There is no built-in
  // "cookie" strategy: Paraglide's first client getLocale() would write the
  // cookie, and we write it only when the user picks a language.
  strategy: ["custom-html", "custom-request", "baseLocale"],
})
