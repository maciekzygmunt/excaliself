// What the public demo allows. It keeps everything in memory and anyone can
// sign in, so its caps are smaller and some actions are off. The server
// enforces all of it; the UI only hides what the server would refuse.

const MB = 1024 * 1024

export const DEMO_LIMITS = {
  /** Trashed ones count too. */
  perAccount: { drawings: 50, folders: 50 },
  /** A drawing's scene JSON, solo or in a Room. */
  sceneBytes: 1 * MB,
  /** Stored images per drawing. */
  imageBytesPerDrawing: 4 * MB,
  /** New demo accounts per client IP address. */
  accountsPerIpPerHour: 10,
}

/** Also shown when a Room refuses an update (SCENE_REFUSED). */
export function sceneTooLarge(maxBytes: number) {
  return `This drawing is too large to save. Drawings save up to ${maxBytes / MB} MB here. Remove some elements to save again.`
}

/** Why the server refused an action. The client shows the message as is. */
export const demoRefusals = {
  account: "In the demo, you can't delete your account.",
  drawings: `The demo allows ${DEMO_LIMITS.perAccount.drawings} drawings per account. Delete some to make more.`,
  folders: `The demo allows ${DEMO_LIMITS.perAccount.folders} folders per account. Delete some to make more.`,
  scene: sceneTooLarge(DEMO_LIMITS.sceneBytes),
}

const refusalMessages = new Set<string>(Object.values(demoRefusals))

export const isDemoRefusal = (error: unknown): error is Error =>
  error instanceof Error && refusalMessages.has(error.message)
