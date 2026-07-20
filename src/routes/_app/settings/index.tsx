import { useQuery } from "@tanstack/react-query"
import { createFileRoute } from "@tanstack/react-router"
import { Skeleton } from "@/components/ui/skeleton"
import { currentUserQueryOptions } from "@/features/account/queries"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { useDocumentTitle } from "@/lib/document-title"
import { ProfileSection } from "./-components/ProfileSection"

export const Route = createFileRoute("/_app/settings/")({
  component: AccountPage,
})

// The Account page (spec §5.12). The layout loader ensures the currentUser
// query, so navigation normally renders straight into content; the delayed
// skeleton (spec §4.3) covers cold loads without flashing on cache hits.
function AccountPage() {
  const { data: user, isPending } = useQuery(currentUserQueryOptions())
  useDocumentTitle("Settings", { chrome: true })
  const showSkeleton = useDelayedVisible(isPending)

  if (isPending) return showSkeleton ? <AccountSkeleton /> : null
  if (!user) return null

  return (
    <div className="animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <ProfileSection user={user} />
    </div>
  )
}

// Mirrors the loaded layout: the Profile section header plus its two
// labeled fields.
function AccountSkeleton() {
  return (
    <div>
      <div className="mb-4 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-16 motion-reduce:animate-none" />
        <Skeleton className="h-3 w-56 motion-reduce:animate-none" />
      </div>
      <div className="flex max-w-md flex-col gap-5">
        {[0, 1].map((field) => (
          <div key={field} className="flex flex-col gap-2">
            <Skeleton className="h-3.5 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-9 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-64 motion-reduce:animate-none" />
          </div>
        ))}
      </div>
    </div>
  )
}
