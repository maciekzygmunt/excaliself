import { useQuery } from "@tanstack/react-query"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  useRevokeOtherSessions,
  useRevokeSession,
} from "@/features/account/mutations"
import {
  type ActiveSession,
  sessionsQueryOptions,
} from "@/features/account/queries"
import { describeDevice } from "@/features/account/user-agent"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { formatAgo } from "@/lib/relative-time"

// Sessions block (spec §5.12): every signed-in device with a per-row revoke.
// The current session is marked and can only end via sign-out — never from
// this list — so a stray click can't strand the user on a dead page.
export function SessionsSection() {
  const { data: sessions, isPending } = useQuery(sessionsQueryOptions())
  const showSkeleton = useDelayedVisible(isPending)

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-sm font-medium text-foreground">Sessions</h2>
        <p className="text-xs text-muted-foreground">
          Devices currently signed in to your account
        </p>
      </div>

      {isPending ? (
        showSkeleton ? (
          <SessionsSkeleton />
        ) : null
      ) : (
        sessions && <SessionList sessions={sessions} />
      )}
    </section>
  )
}

function SessionList({ sessions }: { sessions: ActiveSession[] }) {
  const revokeSession = useRevokeSession()
  const revokeOthers = useRevokeOtherSessions()
  const hasOthers = sessions.some((session) => !session.current)

  return (
    <div className="flex flex-col gap-4 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="flex items-center gap-3 px-4 py-3 text-sm"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate font-medium text-foreground">
                  {describeDevice(session.userAgent)}
                </span>
                {session.current && (
                  <span className="shrink-0 rounded-full bg-iris-muted px-2 py-0.5 text-[11px] font-medium text-iris-strong">
                    Current session
                  </span>
                )}
              </div>
              {/* Server and client can straddle a minute boundary */}
              <p
                suppressHydrationWarning
                className="truncate text-xs text-muted-foreground"
              >
                {[session.ipAddress, formatAgo(session.lastActiveAt)]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
            {!session.current && (
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => revokeSession(session.id)}
              >
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>

      {hasOthers && (
        <div>
          <Button variant="outline" size="sm" onClick={() => revokeOthers()}>
            Sign out all other sessions
          </Button>
        </div>
      )}
    </div>
  )
}

// Mirrors the loaded layout: two session rows' worth of list.
function SessionsSkeleton() {
  return (
    <div className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60">
      {[0, 1].map((row) => (
        <div key={row} className="flex flex-col gap-2 px-4 py-3.5">
          <Skeleton className="h-4 w-36 motion-reduce:animate-none" />
          <Skeleton className="h-3 w-52 motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  )
}
