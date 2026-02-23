export const queryKeys = {
  drawings: () => ["drawings"] as const,
  drawing: (id: string) => ["drawing", id] as const,
  folders: () => ["folders"] as const,
  admin: {
    users: () => ["admin", "users"] as const,
    invites: () => ["admin", "invites"] as const,
  },
}
