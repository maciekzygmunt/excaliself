import { Link } from "@tanstack/react-router"
import { Lock, type LucideIcon, Users } from "lucide-react"
import type { Space } from "@/db/schema"
import { cn } from "@/lib/utils"

const segments: { space: Space; label: string; icon: LucideIcon }[] = [
  { space: "private", label: "Private", icon: Lock },
  { space: "team", label: "Team", icon: Users },
]

/**
 * The Private | Team scope of a browse surface. Each segment is a link that
 * sets the `space` param, so reload and back/forward keep the scope.
 */
export function SpaceSwitch({
  to,
  space,
}: {
  to: "/draw" | "/drawings"
  space: Space
}) {
  return (
    <nav
      aria-label="Space"
      className="relative grid grid-cols-2 rounded-md bg-well p-0.5 shadow-well"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-keycap-from shadow-keycap transition-transform duration-200 ease-out motion-reduce:transition-none",
          space === "team" && "translate-x-full",
        )}
      />
      {segments.map(({ space: segment, label, icon: Icon }) => {
        const active = segment === space
        return (
          <Link
            key={segment}
            to={to}
            // Private is the default, so its URL carries no param.
            search={segment === "team" ? { space: "team" } : {}}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex items-center justify-center gap-1.5 px-2.5 py-1 text-xs font-medium transition-colors",
              active
                ? "text-foreground"
                : "text-muted-foreground/70 hover:text-foreground",
            )}
          >
            <Icon
              className={cn("h-3 w-3", active && "text-iris")}
              strokeWidth={2.25}
            />
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
