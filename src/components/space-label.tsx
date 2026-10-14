import { Lock, type LucideIcon, Users } from "lucide-react"
import type { Space } from "@/db/schema"
import { cn } from "@/lib/utils"

/** Each space's name and icon, shared by the space switch and labels. */
export const SPACES: Record<Space, { label: string; icon: LucideIcon }> = {
  private: { label: "Private", icon: Lock },
  team: { label: "Team", icon: Users },
}

/** Which space a search result lives in. Meta text, inheriting its color. */
export function SpaceLabel({
  space,
  className,
}: {
  space: Space
  className?: string
}) {
  const { label, icon: Icon } = SPACES[space]
  return (
    <span className={cn("flex shrink-0 items-center gap-1", className)}>
      <Icon aria-hidden className="h-3 w-3" strokeWidth={2.25} />
      {label}
    </span>
  )
}
