import { Link } from "@tanstack/react-router"
import { LogOut, Settings, Users } from "lucide-react"
import { InitialsAvatar } from "@/components/initials-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { userDisplayName } from "@/features/account/display-name"
import { authClient } from "@/lib/auth-client"

export type SidebarUser = {
  email: string
  name: string | null
  isAdmin: boolean
}

export function SidebarUserMenu({ user }: { user: SidebarUser }) {
  const displayName = userDisplayName(user)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2.5 rounded-[10px] bg-card px-2.5 py-2 shadow-[0_0_0_1px_rgba(25,25,50,0.08),0_1px_2px_rgba(20,20,45,0.05),inset_0_1px_0_rgba(255,255,255,0.9)] transition-[box-shadow,scale] duration-150 hover:shadow-[0_0_0_1px_rgba(25,25,50,0.14),0_2px_5px_rgba(20,20,45,0.08),inset_0_1px_0_rgba(255,255,255,0.9)] focus-visible:outline-none active:scale-[0.98] dark:shadow-[0_0_0_1px_rgba(255,255,255,0.1)] dark:hover:shadow-[0_0_0_1px_rgba(255,255,255,0.16)]"
          />
        }
      >
        <InitialsAvatar name={user.name} email={user.email} />
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-xs font-medium leading-tight text-foreground">
            {displayName}
          </div>
          {user.isAdmin && (
            <div className="font-mono text-[10px] leading-snug text-muted-foreground">
              admin
            </div>
          )}
        </div>
        <Settings className="h-[13px] w-[13px] shrink-0 text-muted-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--anchor-width) min-w-56 rounded-lg"
        side="top"
        align="start"
        sideOffset={4}
      >
        {user.isAdmin && (
          <>
            <DropdownMenuItem render={<Link to="/settings/members" />}>
              <Users className="mr-2 h-4 w-4" />
              Members
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem render={<Link to="/settings" />}>
          <Settings className="mr-2 h-4 w-4" />
          Settings
        </DropdownMenuItem>
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
