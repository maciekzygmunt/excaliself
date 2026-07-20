// Spec §5.12: the display name when set, the email prefix otherwise —
// a user is never shown as a blank.
export function userDisplayName(user: {
  name?: string | null
  email: string
}): string {
  return user.name || user.email.split("@")[0] || user.email
}
