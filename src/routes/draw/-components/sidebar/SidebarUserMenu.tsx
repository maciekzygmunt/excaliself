import { Link } from "@tanstack/react-router"
import { LogOut, Settings } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"

export type SidebarUser = {
  email: string
  isAdmin: boolean
}

export function SidebarUserMenu({ user }: { user: SidebarUser }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
        >
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted-foreground/20 text-[10px] font-medium text-sidebar-foreground">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0 text-left">
            <div className="truncate text-sm text-sidebar-foreground/80">
              {user.email}
            </div>
          </div>
          <Settings className="h-[13px] w-[13px] shrink-0 text-muted-foreground/30" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        side="top"
        align="start"
        sideOffset={4}
      >
        {user.isAdmin && (
          <>
            <DropdownMenuItem asChild>
              <Link to="/admin">
                <Settings className="mr-2 h-4 w-4" />
                Admin Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut()
            window.location.href = "/login"
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
