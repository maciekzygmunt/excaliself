// What an export needs besides the elements: the drawing's image files and
// its canvas color.

import { and, eq, inArray } from "drizzle-orm"
import type { Db } from "@/db"
import { drawingFiles } from "@/db/schema"
import type { ExportFile } from "./svg"

/** The stored files of the scene's image elements, as data URLs. */
export async function loadImageFiles(
  db: Db,
  drawingId: string,
  elements: readonly Record<string, unknown>[],
): Promise<Map<string, ExportFile>> {
  const fileIds = [
    ...new Set(
      elements.flatMap((element) =>
        element.type === "image" &&
        !element.isDeleted &&
        typeof element.fileId === "string"
          ? [element.fileId]
          : [],
      ),
    ),
  ]
  if (fileIds.length === 0) return new Map()
  const rows = await db
    .select({
      fileId: drawingFiles.fileId,
      mimeType: drawingFiles.mimeType,
      bytes: drawingFiles.bytes,
    })
    .from(drawingFiles)
    .where(
      and(
        eq(drawingFiles.drawingId, drawingId),
        inArray(drawingFiles.fileId, fileIds),
      ),
    )
  return new Map(
    rows.map(({ fileId, mimeType, bytes }) => [
      fileId,
      {
        mimeType,
        dataURL: `data:${mimeType};base64,${Buffer.from(bytes).toString("base64")}`,
      },
    ]),
  )
}

/** The canvas color saved with the scene; white when there is none. */
export function sceneBackgroundColor(data: string | null) {
  try {
    const color = JSON.parse(data ?? "")?.appState?.viewBackgroundColor
    return typeof color === "string" && color ? color : "#ffffff"
  } catch {
    return "#ffffff"
  }
}
