import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The demo's sign-in: one click makes a new account. A plain link, as
 * /demo is a server route that sets the session cookie.
 */
export function DemoStart({ redirect }: { redirect?: string }) {
  const href = redirect
    ? `/demo?redirect=${encodeURIComponent(redirect)}`
    : "/demo"
  return (
    <div className="space-y-3">
      <a href={href} className={cn(buttonVariants(), "w-full")}>
        Start the demo
      </a>
      <p className="text-center text-xs text-muted-foreground">
        We delete demo accounts and their drawings regularly.
      </p>
    </div>
  )
}
