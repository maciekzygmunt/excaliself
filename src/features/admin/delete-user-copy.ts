/**
 * The member-delete confirms' Team sentence: "Their 2 Team drawings stay
 * with the team." Null when there are none, so the copy stays as before.
 */
export function describeKeptTeamDrawings(
  owner: "Their" | "Your",
  count: number,
): string | null {
  if (count === 0) return null
  return count === 1
    ? `${owner} 1 Team drawing stays with the team.`
    : `${owner} ${count} Team drawings stay with the team.`
}
