import { userInitials } from "@/features/account/display-name"
import { cn } from "@/lib/utils"

// The one initials circle for every surface a user appears on (sidebar user
// card, member lists) — spec §5.12: no uploads, `users.image` stays
// dormant. Decorative — the accessible name lives in the adjacent text.
// Size via className (defaults to the sidebar's 24px).
export function InitialsAvatar({
  name,
  email,
  className,
}: {
  name: string | null | undefined
  email: string
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
      {userInitials({ name, email })}
    </span>
  )
}
