// The sessions list always reads current-session-first, then most recently
// active. Shared by the server's initial ordering and the client's rollback
// re-insertion so the two can never disagree.
export function compareSessions(
  a: { current: boolean; lastActiveAt: Date | string },
  b: { current: boolean; lastActiveAt: Date | string },
): number {
  return (
    Number(b.current) - Number(a.current) ||
    new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime()
  )
}
