// Copies a Team library item: fresh ids, links inside the item remapped,
// links to anything outside it dropped.

import { randomInt } from "node:crypto"
import { z } from "zod"
import {
  MAX_ELEMENT_DEPTH,
  nestedDeeperThan,
  type SceneElement,
} from "@/features/collab/protocol"
import { describeIssues, sceneElement } from "./element-input"
import { newId } from "./elements"
import { SceneInputError } from "./skeleton"

const item = z.object({ elements: z.array(sceneElement).min(1) })

/** The fields a copy rewrites; the rest is kept as is. */
type Source = {
  id?: unknown
  x: number
  y: number
  isDeleted?: boolean
  points?: [number, number][]
  groupIds?: string[]
  frameId?: string | null
  containerId?: string | null
  boundElements?: { id: string }[] | null
  startBinding?: { elementId: string } | null
  endBinding?: { elementId: string } | null
}

const invalid = (reason: string) =>
  new SceneInputError(`Invalid library item: ${reason}`)

/** The origin, or a line's leftmost and topmost point. Ignores rotation. */
const topLeft = ({ x, y, points = [] }: Source) => [
  points.reduce((min, [px]) => Math.min(min, x + px), x),
  points.reduce((min, [, py]) => Math.min(min, y + py), y),
]

/** Copies one item with its top-left at (x, y). */
export function instantiateLibraryItem(
  elements: unknown,
  x: number,
  y: number,
): SceneElement[] {
  const parsed = item.safeParse({ elements })
  if (!parsed.success) throw invalid(describeIssues(parsed.error.issues))
  const all = parsed.data.elements as unknown as Source[]
  const ids = new Map<string, string>()
  all.forEach((element, index) => {
    const { id } = element
    if (typeof id !== "string" || !id || ids.has(id))
      throw invalid(`elements[${index}] needs a unique id.`)
    if (nestedDeeperThan(element, MAX_ELEMENT_DEPTH))
      throw invalid(`elements[${index}] is nested too deep.`)
    ids.set(id, newId())
  })
  const sources = all.filter((element) => !element.isDeleted)
  if (sources.length === 0) throw invalid("every element is deleted.")

  const corners = sources.map(topLeft)
  const left = Math.min(...corners.map(([cx]) => cx))
  const top = Math.min(...corners.map(([, cy]) => cy))
  const groups = new Map<string, string>()
  const group = (id: string) =>
    groups.get(id) ?? (groups.set(id, newId()).get(id) as string)
  // Absent stays absent; a link outside the item becomes null.
  const ref = (id: string | null | undefined) =>
    id ? (ids.get(id) ?? null) : id
  const bind = <T extends { elementId: string }>(binding?: T | null) =>
    binding &&
    (ids.has(binding.elementId)
      ? { ...binding, elementId: ids.get(binding.elementId) as string }
      : null)

  return sources.map((source) => ({
    ...source,
    id: ids.get(source.id as string) as string,
    x: source.x - left + x,
    y: source.y - top + y,
    groupIds: source.groupIds?.map(group),
    frameId: ref(source.frameId),
    containerId: ref(source.containerId),
    boundElements: source.boundElements?.flatMap((bound) => {
      const id = ids.get(bound.id)
      return id ? [{ ...bound, id }] : []
    }),
    startBinding: bind(source.startBinding),
    endBinding: bind(source.endBinding),
    index: null,
    version: 1,
    versionNonce: randomInt(1, 2 ** 31),
  }))
}
