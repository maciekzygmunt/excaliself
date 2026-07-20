import { Link } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { AuthIllustration } from "@/components/auth-illustration"
import { INVITES_ROUTE } from "@/lib/routes"
import { cn } from "@/lib/utils"

// First-run cascade: each child fades in and rises 8px, staggered so the eye
// reads illustration → CTA → hint (→ invite). Backwards fill keeps delayed
// items invisible until their turn; the whole sequence lands in 450ms.
// Duration, delay, and easing go through animation-only properties (not
// duration-*/delay-*/ease-*, which also set the transition-* side) so the
// button's 150ms hover transition stays untouched. Reduced-motion drops the
// slide/zoom, keeps the fade.
const CASCADE =
  "animate-in fade-in-0 slide-in-from-bottom-2 animation-duration-300 [animation-timing-function:var(--ease-out)] fill-mode-backwards motion-reduce:slide-in-from-bottom-0"

/**
 * Tier-1 "nothing exists yet" empty state, shared by every surface that can
 * hold zero drawings (Home today, browse later). Owns its copy and actions
 * wholesale: callers say only who is looking (admins get the invite path)
 * and what creating a drawing does.
 */
export function IllustratedEmptyState({
  isAdmin,
  onCreate,
}: {
  isAdmin: boolean
  onCreate: () => void
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-1.5 py-16 text-center">
      {/* The auth panel's hand-drawn spark, floating free on the page — a
          containing tile at this size reads as a placeholder swatch, not an
          illustration. */}
      <div className={cn(CASCADE, "zoom-in-95 motion-reduce:zoom-in-100 mb-3")}>
        <AuthIllustration className="h-36 w-auto text-iris" />
      </div>
      <button
        type="button"
        // Not passed as the handler directly: onCreate's implementations may
        // take optional params (e.g. a folder scope) that a MouseEvent would
        // masquerade as
        onClick={() => onCreate()}
        className={cn(
          CASCADE,
          "[--tw-animation-delay:75ms]",
          "flex items-center gap-1.5 rounded-lg bg-iris px-3.5 py-2 text-[13px] font-medium text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.2),0_1px_2px_rgba(20,20,45,0.2)] transition-[filter,scale] duration-150 hover:brightness-105 active:scale-[0.98]",
        )}
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
        Create your first drawing
      </button>
      <p
        className={cn(
          CASCADE,
          "[--tw-animation-delay:100ms]",
          "text-[13px] text-muted-foreground",
        )}
      >
        or press{" "}
        <kbd className="rounded border border-border bg-card px-1 py-px font-sans text-xs text-foreground/80 shadow-[0_1px_0_var(--border)]">
          N
        </kbd>{" "}
        anytime
      </p>
      {isAdmin && (
        <Link
          to={INVITES_ROUTE}
          className={cn(
            CASCADE,
            "[--tw-animation-delay:150ms]",
            "mt-3 text-[13px] font-medium text-iris transition-colors duration-150 hover:text-iris-strong",
          )}
        >
          Invite your team <span aria-hidden>→</span>
        </Link>
      )}
    </div>
  )
}
