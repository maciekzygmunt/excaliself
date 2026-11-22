import { Link } from "@tanstack/react-router"
import { CloudOff, LogOut, Settings, Users } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/user-avatar"
import { userDisplayName, userInitials } from "@/features/account/display-name"
import { setDeviceAccount } from "@/features/offline/store"
import { useOfflineEnabled } from "@/features/offline/use-offline-enabled"
import { authClient } from "@/lib/auth-client"
import { m } from "@/paraglide/messages"

export type SidebarUser = {
  id: string
  createdAt: Date
  email: string
  name: string | null
  image: string | null
  isAdmin: boolean
}

export function SidebarUserMenu({ user }: { user: SidebarUser }) {
  const offline = useOfflineEnabled()
  const displayName = userDisplayName(user)
  return (
    <DropdownMenu>
      {/* A quiet avatar row, not a card — per the prototype; the wash on
          hover is the only added affordance for the menu it opens. */}
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md px-2 pt-1.5 pb-1 transition-colors hover:bg-sidebar-accent focus-visible:bg-sidebar-accent focus-visible:outline-none"
          />
        }
      >
        <UserAvatar
          initials={userInitials(user)}
          image={user.image}
          className="size-5.5"
        />
        <span className="truncate text-[12px] opacity-60">{displayName}</span>
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
              {m.settings_nav_members()}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        {/* Client-side, so the open canvas unmounts and flushes its edits. */}
        {offline && (
          <DropdownMenuItem render={<Link to="/offline" />}>
            <CloudOff className="mr-2 h-4 w-4" />
            {m.offline_title()}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem render={<Link to="/settings" />}>
          <Settings className="mr-2 h-4 w-4" />
          {m.settings_title()}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await authClient.signOut()
            setDeviceAccount(null)
            window.location.href = "/login"
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          {m.sidebar_sign_out()}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
