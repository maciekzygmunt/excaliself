import { Link, useParams } from "@tanstack/react-router"
import { Star, StarOff } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useToggleStarDrawing } from "@/features/drawings/mutations"
import { cn } from "@/lib/utils"
import type { Drawing } from "./tree"

// Renders nothing until the first star exists — the section never shows empty.
export function StarredSection({ drawings }: { drawings: Drawing[] }) {
  const starred = drawings.filter((d) => d.starred)
  if (starred.length === 0) return null

  return (
    <div className="pt-1">
      <div className="pt-1 pb-0.5 pl-4">
        <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/70">
          Starred
        </span>
      </div>
      <SidebarMenu className="gap-0 px-2">
        {starred.map((drawing) => (
          <StarredItem key={drawing.id} drawing={drawing} />
        ))}
      </SidebarMenu>
    </div>
  )
}

function StarredItem({ drawing }: { drawing: Drawing }) {
  // Non-strict: on Home no drawing is open and there is no $id param
  const { id: currentDrawingId } = useParams({ strict: false })
  const isActive = drawing.id === currentDrawingId
  const starMutation = useToggleStarDrawing()

  return (
    <SidebarMenuItem className="group/starred-row">
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className={cn(
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 pr-2! text-[13px] [&>svg]:size-auto",
          "data-[active=true]:bg-iris-muted data-[active=true]:shadow-[inset_0_0_0_1px_var(--iris-ring)]",
        )}
      >
        <Link to="/draw/$id" params={{ id: drawing.id }}>
          <Star
            className={cn(
              "h-3.25! w-3.25! shrink-0 transition-colors",
              isActive
                ? "fill-iris text-iris"
                : "fill-muted-foreground/40 text-muted-foreground/40",
            )}
          />
          <span
            className={cn(
              "truncate transition-colors",
              isActive
                ? "font-medium text-iris-strong"
                : "text-sidebar-foreground/60",
            )}
          >
            {drawing.name}
          </span>
        </Link>
      </SidebarMenuButton>

      <SidebarMenuAction
        aria-label={`Unstar ${drawing.name}`}
        className="text-muted-foreground/30 md:opacity-0 group-hover/starred-row:opacity-100 group-focus-within/starred-row:opacity-100 [&>svg]:size-auto"
        onClick={() =>
          starMutation.mutate({ data: { id: drawing.id, starred: false } })
        }
      >
        <StarOff className="h-3.5! w-3.5!" />
      </SidebarMenuAction>
    </SidebarMenuItem>
  )
}
