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
  const displayName = user.email.split("@")[0] || user.email
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-[10px] bg-card px-2.5 py-2 shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_2px_5px_rgba(20,20,45,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:outline-none active:scale-[0.98] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-iris-ring text-[10px] font-semibold text-iris-strong">
            {user.email.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1 text-left">
            <div className="truncate text-xs font-medium leading-tight text-foreground">
              {displayName}
            </div>
            <div className="flex items-center gap-1 font-mono text-[10px] leading-snug text-muted-foreground">
              <span className="h-[5px] w-[5px] rounded-full bg-[#7fae7a]" />
              synced{user.isAdmin ? " · admin" : ""}
            </div>
          </div>
          <Settings className="h-[13px] w-[13px] shrink-0 text-muted-foreground/60" />
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
