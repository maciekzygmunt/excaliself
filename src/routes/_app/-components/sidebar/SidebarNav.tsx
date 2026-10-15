import { Link, useMatchRoute } from "@tanstack/react-router"
import { House, LayoutGrid, type LucideIcon } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import type { SpaceSearch } from "@/features/spaces/browse"
import { cn } from "@/lib/utils"
import { useActiveSpace } from "../ActiveSpace"

const items = [
  { to: "/draw", label: "Home", icon: House },
  { to: "/drawings", label: "All drawings", icon: LayoutGrid },
] as const

/** Home and All drawings, scoped to the sidebar's active space. */
export function SidebarNav() {
  const { activeSpace } = useActiveSpace()
  return (
    <SidebarMenu className="gap-0 px-2 pt-1 pb-1">
      {items.map(({ to, label, icon }) => (
        <SidebarNavItem
          key={to}
          to={to}
          search={activeSpace ? { space: activeSpace } : undefined}
          label={label}
          icon={icon}
        />
      ))}
    </SidebarMenu>
  )
}

/** One fixed-nav row — also used for the pinned Trash entry (spec §2.3). */
export function SidebarNavItem({
  to,
  search,
  label,
  icon: Icon,
}: {
  to: string
  search?: SpaceSearch
  label: string
  icon: LucideIcon
}) {
  const matchRoute = useMatchRoute()
  const isActive = matchRoute({ to }) !== false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={to} search={search} />}
        isActive={isActive}
        className={cn(
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 text-[13px] [&>svg]:size-auto",
          "data-[active=true]:bg-iris-muted data-[active=true]:font-medium data-[active=true]:text-iris-strong data-[active=true]:shadow-row-active",
        )}
      >
        <Icon
          className={cn(
            "h-3.25! w-3.25! shrink-0 transition-colors",
            isActive ? "text-iris" : "text-muted-foreground/60",
          )}
        />
        <span className="truncate transition-colors">{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
