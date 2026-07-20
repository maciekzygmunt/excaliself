import type { ReactNode } from "react"

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none shrink-0 rounded-[4px] bg-foreground/[0.05] px-1 py-0.5 font-mono text-[10px] font-medium leading-none text-muted-foreground">
      {children}
    </span>
  )
}
