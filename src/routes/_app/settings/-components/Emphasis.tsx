import type { ReactNode } from "react"

// Renders {#em}…{/em} in Settings messages: the value a sentence is about.
export function Emphasis({ children }: { children?: ReactNode }) {
  return <span className="text-foreground">{children}</span>
}
