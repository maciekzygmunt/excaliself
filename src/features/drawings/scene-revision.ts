import { type AnyColumn, type SQL, sql } from "drizzle-orm"

/** Hex SHA-256 of a scene's stored JSON. Runs in the browser and on the server. */
export async function sceneRevision(data: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(data),
  )
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")
}

/** `sceneRevision` of a stored scene, in SQL. */
export const storedSceneRevision = (data: AnyColumn): SQL<string> =>
  sql`encode(sha256(convert_to(${data}, 'UTF8')), 'hex')`
