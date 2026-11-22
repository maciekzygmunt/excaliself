import {
  createFileRoute,
  Link,
  type LinkProps,
  Outlet,
  useLoaderData,
  useMatchRoute,
} from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

// The Settings area (spec §5.12) renders inside the persistent app shell.
// Bare /settings lands on the Account page via the index route.
export const Route = createFileRoute("/_app/settings")({
  component: SettingsLayout,
})

function SettingsLayout() {
  const { isAdmin } = useLoaderData({ from: "/_app" })
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-8">
        <div className="pb-5">
          <h1 className="text-sm font-semibold tracking-[-0.01em] text-foreground">
            {m.settings_title()}
          </h1>
        </div>
        <div className="flex flex-1 flex-col gap-6 md:flex-row md:items-start md:gap-10">
          <SettingsSubNav isAdmin={isAdmin} />
          <div className="min-w-0 flex-1">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  )
}

// Outline-style second-column sub-nav. Only admins get the Instance group.
function SettingsSubNav({ isAdmin }: { isAdmin: boolean }) {
  return (
    <nav
      aria-label={m.settings_nav_label()}
      className="flex shrink-0 flex-col gap-1 md:w-36"
    >
      {/* On phones each column group becomes a row of pills above the content. */}
      <div className="px-2 pb-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
        {m.settings_nav_account()}
      </div>
      <div className="flex flex-row gap-1 md:flex-col">
        <SettingsNavItem to="/settings" label={m.settings_nav_account()} />
        <SettingsNavItem
          to="/settings/import"
          label={m.settings_nav_import()}
        />
        <SettingsNavItem to="/settings/mcp" label="MCP" />
      </div>
      {isAdmin && (
        <>
          <div className="px-2 pb-0.5 pt-3 text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">
            {m.settings_nav_instance()}
          </div>
          <div className="flex flex-row gap-1 md:flex-col">
            <SettingsNavItem
              to="/settings/members"
              label={m.settings_nav_members()}
            />
            <SettingsNavItem
              to="/settings/invites"
              label={m.settings_nav_invites()}
            />
            <SettingsNavItem
              to="/settings/instance"
              label={m.settings_nav_instance()}
            />
          </div>
        </>
      )}
    </nav>
  )
}

function SettingsNavItem({
  to,
  label,
}: {
  to: LinkProps["to"]
  label: string
}) {
  const matchRoute = useMatchRoute()
  const isActive = matchRoute({ to }) !== false
  return (
    <Link
      to={to}
      className={cn(
        "rounded-md px-2 py-1 text-[13px] transition-colors",
        isActive
          ? "bg-iris-muted font-medium text-iris-strong shadow-row-active"
          : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
    >
      {label}
    </Link>
  )
}
