// A small client for the Excalidraw+ public API, read-only: just what the
// import needs. Server-only: the key must not leave the server's requests,
// and the API does not allow browser calls.

import { z } from "zod"

/** Personal keys act as one user and can read their private scenes. */
const PERSONAL_KEY_PREFIX = "uk-"

/** The virtual collection that holds a personal key owner's private scenes. */
export const PRIVATE_COLLECTION = "private"

const PAGE_SIZE = 100
const REQUEST_TIMEOUT_MS = 60_000
const MAX_RETRIES = 4

export class ExcalidrawPlusError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = "ExcalidrawPlusError"
  }
}

const collectionSchema = z.object({ id: z.string(), name: z.string() })

const sceneSchema = z.object({
  metadata: z.object({
    id: z.string(),
    name: z.string().catch(""),
    created: z.coerce.date().optional().catch(undefined),
    updated: z.coerce.date().optional().catch(undefined),
    pinned: z.boolean().catch(false),
  }),
})

const contentSchema = z.object({
  type: z.string().optional(),
  version: z.number().optional(),
  source: z.string().optional(),
  elements: z.array(z.record(z.string(), z.unknown())),
  appState: z.record(z.string(), z.unknown()).catch({}),
  // Entries are checked one by one on import, so one bad file drops only itself.
  files: z.record(z.string(), z.unknown()).catch({}),
  filesFailedToEmbed: z.array(z.string()).catch([]),
})

export type PlusCollection = z.infer<typeof collectionSchema>
export type PlusScene = z.infer<typeof sceneSchema>["metadata"]
export type PlusSceneContent = z.infer<typeof contentSchema>

const pageSchema = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), hasNextPage: z.boolean() })

/** Read-only Excalidraw+ API calls for one key, against `apiUrl`. */
export function excalidrawPlusApi(apiUrl: string, apiKey: string) {
  async function get(path: string, query: Record<string, number> = {}) {
    const url = new URL(`/api/v1${path}`, apiUrl)
    for (const [key, value] of Object.entries(query))
      url.searchParams.set(key, String(value))

    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      }).catch((error: unknown) => {
        throw new ExcalidrawPlusError(
          0,
          `Couldn't reach Excalidraw+ (${error instanceof Error ? error.message : "network error"})`,
        )
      })
      const retry =
        response.status === 429 ||
        response.status === 502 ||
        response.status === 503 ||
        response.status === 504
      if (retry && attempt < MAX_RETRIES) {
        await response.body?.cancel()
        await sleep(retryDelayMs(response.headers.get("retry-after"), attempt))
        continue
      }
      if (!response.ok) throw await apiError(response)
      return (await response.json()) as unknown
    }
  }

  async function getAllPages<T extends z.ZodType>(path: string, item: T) {
    const items: z.infer<T>[] = []
    for (let offset = 0; ; ) {
      const page = pageSchema(item).parse(
        await get(path, { limit: PAGE_SIZE, offset }),
      )
      items.push(...page.data)
      if (!page.hasNextPage || page.data.length === 0) return items
      offset += page.data.length
    }
  }

  return {
    keyType: apiKey.startsWith(PERSONAL_KEY_PREFIX)
      ? ("personal" as const)
      : ("workspace" as const),
    collections: () => getAllPages("/collections", collectionSchema),
    scenesIn: async (collectionId: string) =>
      (
        await getAllPages(
          `/collections/${encodeURIComponent(collectionId)}/scenes`,
          sceneSchema,
        )
      ).map((scene) => scene.metadata),
    sceneContent: async (sceneId: string) =>
      contentSchema.parse(
        await get(`/scenes/${encodeURIComponent(sceneId)}/content`),
      ),
  }
}

async function apiError(response: Response) {
  if (response.status === 401)
    return new ExcalidrawPlusError(401, "Excalidraw+ didn't accept this key")
  let message = response.statusText
  try {
    const body = (await response.json()) as { message?: unknown }
    if (typeof body.message === "string") message = body.message
  } catch {}
  return new ExcalidrawPlusError(
    response.status,
    `Excalidraw+ answered ${response.status}: ${message}`,
  )
}

/** Retry-After seconds when given (capped at 60 s), else exponential backoff. */
function retryDelayMs(retryAfter: string | null, attempt: number) {
  const seconds = Number(retryAfter)
  if (retryAfter && Number.isFinite(seconds) && seconds >= 0)
    return Math.min(seconds * 1000, 60_000)
  return 500 * 2 ** attempt
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
