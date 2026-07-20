import { Link, useMatchRoute } from "@tanstack/react-router"
import { House, LayoutGrid } from "lucide-react"
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
  const matchRoute = useMatchRoute()

  return (
    <SidebarMenu className="gap-0 px-2 pt-1 pb-1">
      {items.map(({ to, label, icon: Icon }) => {
        const isActive = matchRoute({ to }) !== false
        return (
          <SidebarMenuItem key={to}>
            <SidebarMenuButton
              asChild
              isActive={isActive}
              className={cn(
                "h-auto cursor-pointer gap-1.5 px-2 py-1.5 text-[13px] [&>svg]:size-auto",
                "data-[active=true]:bg-iris-muted data-[active=true]:shadow-[inset_0_0_0_1px_var(--iris-ring)]",
              )}
            >
              <Link to={to}>
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
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}
