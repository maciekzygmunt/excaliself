import { useQuery } from "@tanstack/react-query"
import { createFileRoute, useLoaderData } from "@tanstack/react-router"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { currentUserQueryOptions } from "@/features/account/queries"
import { useDelayedVisible } from "@/hooks/use-delayed-visible"
import { useDocumentTitle } from "@/lib/document-title"
import { AppearanceSection } from "./-components/AppearanceSection"
import { DangerZoneSection } from "./-components/DangerZoneSection"
import { EmailSection } from "./-components/EmailSection"
import { PasswordSection } from "./-components/PasswordSection"
import { ProfileSection } from "./-components/ProfileSection"
import { SessionsSection } from "./-components/SessionsSection"

export const Route = createFileRoute("/_app/settings/")({
  component: AccountPage,
})

// The Account page (spec §5.12). The layout loader ensures the currentUser
// query, so navigation normally renders straight into content; the delayed
// skeleton (spec §4.3) covers cold loads without flashing on cache hits.
function AccountPage() {
  const { data: user, isPending } = useQuery(currentUserQueryOptions())
  const demo = useLoaderData({
    from: "__root__",
    select: (site) => site.instanceMode === "demo",
  })
  useDocumentTitle("Settings", { chrome: true })
  const showSkeleton = useDelayedVisible(isPending)

  if (isPending) return showSkeleton ? <AccountSkeleton /> : null
  if (!user) return null

  return (
    <div className="flex flex-col gap-8 animate-in fade-in-0 duration-200 motion-reduce:animate-none">
      <ProfileSection user={user} />
      <Separator />
      {demo ? (
        <DemoAccountSection />
      ) : (
        <>
          <EmailSection user={user} />
          <Separator />
          <PasswordSection />
        </>
      )}
      <Separator />
      <SessionsSection />
      <Separator />
      <AppearanceSection />
      {!demo && (
        <>
          <Separator />
          <DangerZoneSection user={user} />
        </>
      )}
    </div>
  )
}

// Demo visitors never learn their password, and the server refuses
// account deletion.
function DemoAccountSection() {
  return (
    <section>
      <h2 className="text-sm font-medium text-foreground">Demo account</h2>
      <p className="text-xs text-muted-foreground">
        In the demo, you can't change your email or password, or delete your
        account. We delete demo accounts and their drawings regularly.
      </p>
    </section>
  )
}

// Mirrors the loaded layout: three section headers, each with its labeled
// fields (Profile has one, Email and Password two each).
function AccountSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      {[1, 2, 2].map((fields, section) => (
        <div key={section}>
          <div className="mb-4 flex flex-col gap-1.5">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-3 w-56" />
          </div>
          <div className="flex max-w-md flex-col gap-5">
            {Array.from({ length: fields }, (_, field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
