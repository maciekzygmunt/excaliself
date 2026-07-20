import { cn } from "@/lib/utils"

// Spec §5.12: the generated initials avatar is seeded from the display name
// once set — first letters of the first two words — and falls back to the
// email's first letter otherwise. No uploads; `users.image` stays dormant.
export function userInitials(
  name: string | null | undefined,
  email: string,
): string {
  const words = name?.trim().split(/\s+/).filter(Boolean) ?? []
  const letters =
    words.length > 0
      ? words.slice(0, 2).map((word) => word.charAt(0))
      : [email.charAt(0)]
  return letters.join("").toUpperCase()
}

// The one initials circle for every surface a user appears on (sidebar user
// card, member lists). Decorative — the accessible name lives in the
// adjacent text. Size via className (defaults to the sidebar's 24px).
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
      {userInitials(name, email)}
    </span>
  )
}
