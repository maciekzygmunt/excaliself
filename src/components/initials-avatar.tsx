import { cn } from "@/lib/utils"

// The one initials circle for every surface a user appears on (sidebar user
// card, member lists, Team card creators) — spec §5.12: no uploads,
// `users.image` stays dormant. Pass `userInitials(user)`. Decorative — the
// accessible name lives in the adjacent text. Size via className (defaults
// to the sidebar's 24px).
export function InitialsAvatar({
  initials,
  className,
}: {
  initials: string
  className?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex h-6 w-6 shrink-0 select-none items-center justify-center rounded-full bg-iris-ring text-[10px] font-semibold text-iris-strong",
        className,
      )}
    >
      {initials}
    </span>
  )
}
