import { z } from "zod"

// Read straight from process.env, not env.ts: the mode shapes env.ts's
// schema, and modules that tests load must not need a full environment.
// Server only. Accepts true/false, 1/0, yes/no, on/off; empty counts as unset.
const flag = (name: string) =>
  z
    .stringbool()
    .default(false)
    .parse(process.env[name] || undefined)

function readInstanceMode() {
  const preview = flag("PREVIEW_MODE")
  const demo = flag("DEMO_MODE")
  if (preview && demo) {
    throw new Error("Set PREVIEW_MODE or DEMO_MODE, not both")
  }
  return demo ? "demo" : preview ? "preview" : "standard"
}

/**
 * `preview` (PREVIEW_MODE) and `demo` (DEMO_MODE) both run on an in-memory
 * PGlite with example content instead of Postgres. The demo is public, so it
 * has stricter rules.
 */
export const instanceMode: "standard" | "preview" | "demo" = readInstanceMode()
