import { Link, useMatchRoute } from "@tanstack/react-router"
import { House, LayoutGrid, type LucideIcon } from "lucide-react"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { cn } from "@/lib/utils"

const items = [
  { to: "/draw", label: "Home", icon: House },
  { to: "/drawings", label: "All drawings", icon: LayoutGrid },
] as const

export function SidebarNav() {
  return (
    <SidebarMenu className="gap-0 px-2 pt-1 pb-1">
      {items.map(({ to, label, icon }) => (
        <SidebarNavItem key={to} to={to} label={label} icon={icon} />
      ))}
    </SidebarMenu>
  )
}

/** One fixed-nav row — also used for the pinned Trash entry (spec §2.3). */
export function SidebarNavItem({
  to,
  label,
  icon: Icon,
}: {
  to: string
  label: string
  icon: LucideIcon
}) {
  const matchRoute = useMatchRoute()
  const isActive = matchRoute({ to }) !== false

  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        render={<Link to={to} />}
        isActive={isActive}
        className={cn(
          "h-auto cursor-pointer gap-1.5 px-2 py-1.5 text-[13px] [&>svg]:size-auto",
          "data-[active=true]:bg-iris-muted data-[active=true]:shadow-[inset_0_0_0_1px_var(--iris-ring)]",
        )}
      >
        <Icon
          className={cn(
            "h-3.25! w-3.25! shrink-0 transition-colors",
            isActive ? "text-iris" : "text-muted-foreground/40",
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
          {label}
        </span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}
