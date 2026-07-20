// Spec §5.12 identity-presentation rules, kept in one module so the
// fallbacks can't drift: the display name when set, the email prefix
// otherwise — a user is never shown as a blank.

type UserIdentity = {
  name?: string | null
  email: string
}

export function emailPrefix(email: string): string {
  return email.split("@")[0] || email
}

export function userDisplayName(user: UserIdentity): string {
  return user.name || emailPrefix(user.email)
}

// The generated initials avatar is seeded from the display name once set —
// first letters of the first two words — and falls back to the email's
// first letter otherwise.
export function userInitials(user: UserIdentity): string {
  const words = user.name?.trim().split(/\s+/).filter(Boolean) ?? []
  const letters =
    words.length > 0
      ? words.slice(0, 2).map((word) => word.charAt(0))
      : [user.email.charAt(0)]
  return letters.join("").toUpperCase()
}
