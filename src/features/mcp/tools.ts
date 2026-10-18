// The MCP server one member's AI client talks to: find, read, and create
// drawings, under the same Space rule as that member's browser. Editing an
// existing drawing is left out: shared and Team drawings are written only by
// their Room (ADR 0002).

import { McpServer } from "@modelcontextprotocol/server"
import { and, eq, isNull } from "drizzle-orm"
import type { NodePgDatabase } from "drizzle-orm/node-postgres"
import { z } from "zod"
import type * as schema from "@/db/schema"
import { drawings, folders, spaces } from "@/db/schema"
import { userDisplayName } from "@/features/account/display-name"
import { rooms } from "@/features/collab/room-registry"
import { insertDrawing } from "@/features/drawings/create"
import { listDrawings } from "@/features/drawings/list"
import { findInScene, parseSceneElements } from "@/features/drawings/search"
import { accessibleTo } from "@/features/spaces/access"
import { buildScene, SceneInputError } from "./scene/build"
import { parseMermaid } from "./scene/mermaid"
import { directions, elementSkeleton, type SceneGraph } from "./scene/skeleton"
import { summarizeScene } from "./summary"

type Db = NodePgDatabase<typeof schema>

export type Member = { id: string; name: string; email: string }

const space = z
  .enum(spaces)
  .describe('"private" (only you) or "team" (every member).')

const text = (value: string) => ({
  content: [{ type: "text" as const, text: value }],
})
const json = (value: unknown) => text(JSON.stringify(value))
const failure = (message: string) => ({ ...text(message), isError: true })

/** One per request: the server knows its member and the instance's origin. */
export function createMcpServer(db: Db, member: Member, origin: string) {
  const server = new McpServer(
    { name: "excaliself", version: "1.0.0" },
    {
      // Bounds the work one create_drawing call can ask for.
      maxToolInputElements: 20_000,
      instructions: `Excaliself is a self-hosted Excalidraw. You act as ${userDisplayName(member)}. Every drawing and folder lives in a Space: "private" (only this member sees it) or "team" (every member sees it). You can find, read, and create drawings; you can't change or delete existing ones.`,
    },
  )
  const drawingUrl = (id: string) => `${origin}/draw/${id}`

  /** Every folder the member can see, by id, with its path from the root. */
  const folderPaths = async () => {
    const rows = await db
      .select({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
        space: folders.space,
      })
      .from(folders)
      .where(and(accessibleTo(folders, member.id), isNull(folders.deletedAt)))
    const byId = new Map(rows.map((row) => [row.id, row]))
    const path = (id: string): string => {
      const folder = byId.get(id)
      if (!folder) return ""
      return folder.parentId && byId.has(folder.parentId)
        ? `${path(folder.parentId)} / ${folder.name}`
        : folder.name
    }
    return new Map(
      rows.map((row) => [row.id, { path: path(row.id), space: row.space }]),
    )
  }

  const drawingRows = async (filter: {
    space?: schema.Space
    folderId?: string
  }) => {
    const [list, paths] = await Promise.all([
      listDrawings(db, member.id),
      folderPaths(),
    ])
    const rows = list
      .filter((drawing) => !filter.space || drawing.space === filter.space)
      .filter(
        (drawing) => !filter.folderId || drawing.folderId === filter.folderId,
      )
      .map((drawing) => ({
        drawing,
        row: {
          id: drawing.id,
          name: drawing.name,
          space: drawing.space,
          folder: drawing.folderId
            ? (paths.get(drawing.folderId)?.path ?? null)
            : null,
          folderId: drawing.folderId,
          lastEdited: drawing.updatedAt.toISOString(),
          ...(drawing.space === "team"
            ? { creator: drawing.creator?.name ?? "Former member" }
            : {}),
          url: drawingUrl(drawing.id),
        },
      }))
    return rows
  }

  const limit = (fallback: number) =>
    z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(fallback)
      .describe(`Default ${fallback}.`)

  server.registerTool(
    "list_drawings",
    {
      title: "List drawings",
      description:
        "Lists the drawings you can see, most recently edited first, with their Space and folder.",
      inputSchema: z.object({
        space: space.optional().describe("Only this Space."),
        folderId: z
          .string()
          .optional()
          .describe("Only this folder (see list_folders)."),
        limit: limit(50),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ space, folderId, limit }) => {
      const rows = await drawingRows({ space, folderId })
      return json({
        total: rows.length,
        drawings: rows.slice(0, limit).map(({ row }) => row),
      })
    },
  )

  server.registerTool(
    "search_drawings",
    {
      title: "Search drawings",
      description:
        "Finds drawings whose name or text contains every word of the query, case-insensitive. Name matches come first; each result has a snippet of the text around the match.",
      inputSchema: z.object({
        query: z.string().trim().min(1).max(200),
        space: space.optional().describe("Only this Space."),
        limit: limit(20),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ query, space, limit }) => {
      const words = query.toLowerCase().split(/\s+/)
      const results = (await drawingRows({ space })).flatMap(
        ({ drawing, row }) => {
          const name = drawing.name.toLowerCase()
          const content = drawing.searchText.toLowerCase()
          if (
            !words.every(
              (word) => name.includes(word) || content.includes(word),
            )
          )
            return []
          const inName = words.every((word) => name.includes(word))
          const sceneWord = words.find((word) => content.includes(word))
          const snippet = sceneWord ? findInScene(drawing, sceneWord) : null
          return [
            {
              ...row,
              match: inName ? "name" : "text",
              ...(snippet ? { snippet } : {}),
            },
          ]
        },
      )
      // Stable sort: each group keeps the most recent first.
      results.sort(
        (a, b) => Number(b.match === "name") - Number(a.match === "name"),
      )
      return json({ total: results.length, drawings: results.slice(0, limit) })
    },
  )

  server.registerTool(
    "list_folders",
    {
      title: "List folders",
      description: "Lists the folders you can see, with their Space and path.",
      inputSchema: z.object({
        space: space.optional().describe("Only this Space."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ space }) => {
      const paths = await folderPaths()
      const rows = [...paths]
        .filter(([, folder]) => !space || folder.space === space)
        .map(([id, folder]) => ({ id, ...folder }))
        .sort((a, b) => a.path.localeCompare(b.path))
      return json({ folders: rows })
    },
  )

  server.registerTool(
    "read_drawing",
    {
      title: "Read drawing",
      description:
        "Describes a drawing: its shapes and their labels, text, which shapes arrows connect, and what sits inside what, with positions. Not the raw Excalidraw JSON.",
      inputSchema: z.object({
        id: z
          .string()
          .describe("A drawing id from list_drawings or search_drawings."),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ id }) => {
      const [drawing] = await db
        .select({
          name: drawings.name,
          data: drawings.data,
          space: drawings.space,
          folderId: drawings.folderId,
          updatedAt: drawings.updatedAt,
        })
        .from(drawings)
        .where(
          and(
            eq(drawings.id, id),
            accessibleTo(drawings, member.id),
            isNull(drawings.deletedAt),
          ),
        )
      // Same answer for a missing drawing and one the member can't see.
      if (!drawing) {
        return failure(
          "No drawing has that id. Find one with list_drawings or search_drawings.",
        )
      }
      // A live Room holds newer edits than the stored scene.
      const room = rooms.rooms.get(id)
      if (room) await room.loaded
      const elements = room ? room.elements : parseSceneElements(drawing.data)
      if (!elements)
        return failure("This drawing's data is damaged and can't be read.")

      const folder = drawing.folderId
        ? (await folderPaths()).get(drawing.folderId)?.path
        : undefined
      const where = [
        drawing.space === "team" ? "Team" : "Private",
        folder ? `, folder "${folder}"` : "",
      ].join("")
      return text(
        [
          `${JSON.stringify(drawing.name)} (${where}), last edited ${drawing.updatedAt.toISOString()}. ${drawingUrl(id)}`,
          summarizeScene(elements as Record<string, unknown>[]),
        ].join("\n\n"),
      )
    },
  )

  server.registerTool(
    "create_drawing",
    {
      title: "Create drawing",
      description: `Creates a NEW drawing from simple elements and/or a Mermaid flowchart, and returns its link. Existing drawings can't be changed.

Elements: shapes ("rectangle", "ellipse", "diamond") with an optional label; "text"; and "arrow" or "line" connectors that join shapes by id ("from", "to") or run between points ("start", "end"). Shapes and text without x/y are laid out automatically, in "direction", with arrows routed between them; labels wrap and shapes grow to fit. Auto-layout gives the cleanest diagrams: give x/y (top-left, pixels, y grows down) only for layouts a graph can't express, such as grids or timelines. Keep arrow labels to a few words; put detail in shape labels or a text note.

Mermaid: a "flowchart"/"graph" diagram, with node shapes, edge labels, dotted and thick edges, and subgraphs (drawn as titled boxes). Other Mermaid diagram types are not supported. Both can be sent at once: they are laid out together, and arrows may join flowchart nodes by their Mermaid ids.

Colors: Excalidraw's palette reads best, e.g. backgrounds "#a5d8ff" (blue), "#b2f2bb" (green), "#ffec99" (yellow), "#ffc9c9" (red), "#d0bfff" (violet), "#e9ecef" (gray).`,
      inputSchema: z.object({
        name: z.string().trim().min(1).max(200),
        space: space
          .default("private")
          .describe(
            'Default "private". Ignored with folderId: a drawing takes its folder\'s Space.',
          ),
        folderId: z
          .string()
          .optional()
          .describe("Put it in this folder (see list_folders)."),
        elements: z.array(elementSkeleton).max(1000).optional(),
        mermaid: z
          .string()
          .max(50_000)
          .optional()
          .describe("A Mermaid flowchart."),
        direction: z
          .enum(directions)
          .optional()
          .describe(
            'Auto-layout flow: "TB" top to bottom (default), "LR" left to right, "BT", "RL". Default for Mermaid: its own header.',
          ),
      }),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async (input) => {
      let elements: ReturnType<typeof buildScene>
      try {
        const flowchart: SceneGraph = input.mermaid
          ? parseMermaid(input.mermaid)
          : { elements: [], clusters: [], direction: "TB" }
        elements = buildScene({
          elements: [...flowchart.elements, ...(input.elements ?? [])],
          clusters: flowchart.clusters,
          direction: input.direction ?? flowchart.direction,
        })
      } catch (error) {
        if (error instanceof SceneInputError) return failure(error.message)
        throw error
      }

      let created: { id: string; space: schema.Space }
      try {
        created = await insertDrawing(db, member.id, {
          name: input.name,
          folderId: input.folderId ?? null,
          space: input.space,
          elements: elements as unknown as Record<string, unknown>[],
        })
      } catch (error) {
        if (error instanceof Error && error.message === "Folder not found") {
          return failure("No folder has that id. Find one with list_folders.")
        }
        throw error
      }
      const folder = input.folderId
        ? (await folderPaths()).get(input.folderId)?.path
        : undefined
      return json({
        id: created.id,
        name: input.name,
        space: created.space,
        folder: folder ?? null,
        elements: elements.length,
        url: drawingUrl(created.id),
      })
    },
  )

  return server
}
