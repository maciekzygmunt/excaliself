// Pure last-admin-guard logic (issue #65), shared by the members UI (to
// disable the sole admin's role select) and the server function (to reject
// the demotion regardless of what the client shows).

export type Role = "admin" | "user"

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  user: "Member",
}

export function adminIds(
  members: readonly { id: string; role: Role }[],
): string[] {
  return members
    .filter((member) => member.role === "admin")
    .map((member) => member.id)
}

/** True when demoting `targetId` would leave the instance with no admin. */
export function isLastAdmin(
  adminIds: readonly string[],
  targetId: string,
): boolean {
  return adminIds.length === 1 && adminIds[0] === targetId
}
