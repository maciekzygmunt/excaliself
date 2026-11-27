import { randomInt } from "node:crypto"
import { z } from "zod"
import {
  MAX_ELEMENT_DEPTH,
  nestedDeeperThan,
  type SceneBounds,
  type SceneElement,
} from "@/features/collab/protocol"
import { sceneElement } from "./element-input"
import { newId } from "./elements"
import { SceneInputError } from "./skeleton"

const itemElements = z.array(sceneElement).min(1)
type Element = z.infer<typeof sceneElement>
type ElementType = Element["type"]

const isFrame = (type: ElementType) =>
  type === "frame" || type === "magicframe"
const textContainers: Partial<Record<ElementType, true>> = {
  arrow: true,
  diamond: true,
  ellipse: true,
  rectangle: true,
  stickynote: true,
}

function invalid(index: number, reason: string): never {
  throw new SceneInputError(`Invalid library item: elements[${index}] ${reason}`)
}

/** Linear and freehand points are relative to the element's origin. */
function pointBounds(
  x: number,
  y: number,
  angle: number,
  points: readonly (readonly [number, number])[],
): SceneBounds {
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [px, py] of points) {
    left = Math.min(left, px)
    top = Math.min(top, py)
    right = Math.max(right, px)
    bottom = Math.max(bottom, py)
  }
  if (angle !== 0) {
    const cx = left / 2 + right / 2
    const cy = top / 2 + bottom / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    left = top = Infinity
    right = bottom = -Infinity
    for (const [px, py] of points) {
      const rx = cx + ((px - cx) * cos - (py - cy) * sin)
      const ry = cy + ((px - cx) * sin + (py - cy) * cos)
      left = Math.min(left, rx)
      top = Math.min(top, ry)
      right = Math.max(right, rx)
      bottom = Math.max(bottom, ry)
    }
  }
  return [x + left, y + top, x + right, y + bottom]
}

/** The geometry's box, excluding stroke width and roughness. */
function boundsOf(element: Element, width: number, height: number): SceneBounds {
  const { type, x, y, angle = 0 } = element
  if (type === "arrow" || type === "line" || type === "freedraw")
    return pointBounds(x, y, angle, element.points)
  if (angle === 0)
    return [
      x + Math.min(0, width),
      y + Math.min(0, height),
      x + Math.max(0, width),
      y + Math.max(0, height),
    ]
  const cx = x + width / 2
  const cy = y + height / 2
  const cos = Math.abs(Math.cos(angle))
  const sin = Math.abs(Math.sin(angle))
  const horizontal = Math.abs(width) / 2
  const vertical = Math.abs(height) / 2
  const extent =
    type === "ellipse"
      ? Math.hypot
      : type === "diamond"
        ? Math.max
        : (a: number, b: number) => a + b
  const dx = extent(horizontal * cos, vertical * sin)
  const dy = extent(horizontal * sin, vertical * cos)
  return [cx - dx, cy - dy, cx + dx, cy + dy]
}

type Entry = { element: Element; id: string; index: number }

function checkFrames(bySourceId: Map<string, Entry>): void {
  const visited = new Set<string>()
  const chain = new Set<string>()
  for (const [id, { element, index }] of bySourceId) {
    if (!isFrame(element.type)) continue
    let next: string | null | undefined = id
    while (next && !visited.has(next)) {
      if (chain.has(next)) invalid(index, "has cyclic frame membership.")
      chain.add(next)
      next = bySourceId.get(next)?.element.frameId
    }
    for (const member of chain) visited.add(member)
    chain.clear()
  }
}

/** Clones one item at the given top-left; references outside the item are detached. */
export function instantiateLibraryItem(
  elements: unknown,
  x: number,
  y: number,
): SceneElement[] {
  if (!Number.isFinite(x) || !Number.isFinite(y))
    throw new SceneInputError("Library item placement must be finite.")
  const parsed = itemElements.safeParse(elements)
  if (!parsed.success) {
    const { path, message } = parsed.error.issues[0]
    const [index, ...fields] = path
    const field = fields.length ? `.${fields.join(".")}` : ""
    const where = typeof index === "number" ? `elements[${index}]${field}: ` : ""
    throw new SceneInputError(`Invalid library item: ${where}${message}`)
  }

  const bySourceId = new Map<string, Entry>()
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const [index, element] of parsed.data.entries()) {
    const { id, type, width, height } = element
    if (typeof id !== "string" || !id || bySourceId.has(id))
      invalid(index, "needs a unique id.")
    if (element.isDeleted) invalid(index, "is deleted.")
    if (nestedDeeperThan(element, MAX_ELEMENT_DEPTH))
      invalid(index, `is nested more than ${MAX_ELEMENT_DEPTH} levels deep.`)
    if (width === undefined || height === undefined)
      invalid(index, "needs a width and height.")
    if (type === "image" && !element.fileId)
      invalid(index, "is an image without a file id.")
    if (
      ((type === "arrow" || type === "line") && element.points.length < 2) ||
      (type === "freedraw" && element.points.length === 0)
    )
      invalid(index, "has too few points.")
    const bounds = boundsOf(element, width, height)
    if (!bounds.every(Number.isFinite)) invalid(index, "has non-finite bounds.")
    left = Math.min(left, bounds[0])
    top = Math.min(top, bounds[1])
    right = Math.max(right, bounds[2])
    bottom = Math.max(bottom, bounds[3])
    bySourceId.set(id, { element, id: newId(), index })
  }
  if (!Number.isFinite(right - left + x) || !Number.isFinite(bottom - top + y))
    throw new SceneInputError("Library item bounds are too large to place.")

  checkFrames(bySourceId)
  const groupIds = new Map<string, string>()
  const cloned: SceneElement[] = []
  for (const [sourceId, { element: source, id, index }] of bySourceId) {
    let element: Element
    try {
      element = structuredClone(source)
    } catch {
      invalid(index, "contains uncloneable data.")
    }
    const remap = (
      targetId: string,
      field: string,
      accepts?: (type: ElementType) => boolean,
    ) => {
      const target = bySourceId.get(targetId)
      if (
        !targetId ||
        targetId === sourceId ||
        (target && accepts && !accepts(target.element.type))
      )
        invalid(index, `has an invalid ${field} reference.`)
      return target?.id ?? null
    }

    if (element.groupIds) {
      const seen = new Set<string>()
      element.groupIds = element.groupIds.map((groupId) => {
        if (!groupId || seen.has(groupId)) invalid(index, "has invalid groups.")
        seen.add(groupId)
        let newGroup = groupIds.get(groupId)
        if (!newGroup) {
          newGroup = newId()
          groupIds.set(groupId, newGroup)
        }
        return newGroup
      })
    }
    if (element.frameId != null)
      element.frameId = remap(element.frameId, "frameId", isFrame)
    if (element.containerId != null) {
      if (element.type !== "text") invalid(index, "is not a text label.")
      element.containerId = remap(
        element.containerId,
        "containerId",
        (type) => textContainers[type] === true,
      )
    }
    if (element.boundElements) {
      const kept: NonNullable<Element["boundElements"]> = []
      for (const bound of element.boundElements) {
        const target = remap(
          bound.id,
          "boundElements",
          (type) => type === bound.type,
        )
        if (target !== null) {
          bound.id = target
          kept.push(bound)
        }
      }
      element.boundElements = kept
    }
    if (
      element.type === "arrow" ||
      element.type === "line" ||
      element.type === "freedraw"
    ) {
      for (const key of ["startBinding", "endBinding"] as const) {
        const binding = element[key]
        if (!binding) continue
        const target = remap(binding.elementId, key)
        if (target === null) element[key] = null
        else binding.elementId = target
      }
    } else if (element.startBinding != null || element.endBinding != null) {
      invalid(index, "has an unexpected endpoint binding.")
    }

    const newX = element.x - left + x
    const newY = element.y - top + y
    if (!Number.isFinite(newX) || !Number.isFinite(newY))
      invalid(index, "cannot be placed at those coordinates.")
    cloned.push({
      ...element,
      id,
      x: newX,
      y: newY,
      index: null,
      version: 1,
      versionNonce: randomInt(1, 2 ** 31),
      isDeleted: false,
    })
  }
  return cloned
}
