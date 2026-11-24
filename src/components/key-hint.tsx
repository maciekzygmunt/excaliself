import type { ReactNode } from "react"
import { Kbd } from "@/components/ui/kbd"

// Renders {#key}…{/key} in footer hints like "↵ to rename" as a keycap.
export function HintKey({ children }: { children?: ReactNode }) {
  return <Kbd className="h-4 min-w-4 text-[10px]">{children}</Kbd>
}
