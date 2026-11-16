// The fields the exporter draws with, read out of a stored element's untyped
// JSON with Excalidraw's defaults, so old or partial elements still render.

import { defaultLineHeight } from "./fonts"

export type Point = readonly [number, number]

export type Arrowhead =
  | "arrow"
  | "bar"
  | "circle"
  | "circle_outline"
  | "triangle"
  | "triangle_outline"
  | "diamond"
  | "diamond_outline"
  | "cardinality_one"
  | "cardinality_many"
  | "cardinality_one_or_many"
  | "cardinality_exactly_one"
  | "cardinality_zero_or_one"
  | "cardinality_zero_or_many"

export type Element = {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
  angle: number
  strokeColor: string
  backgroundColor: string
  fillStyle: string
  strokeWidth: number
  strokeStyle: "solid" | "dashed" | "dotted"
  roughness: number
  opacity: number
  seed: number
  roundness: { type: number; value?: number } | null
  frameId: string | null
  /** The bound text's id, from `boundElements`. */
  boundTextId: string | null
  containerId: string | null
  link: string | null
  // Lines, arrows, and freedraw.
  points: Point[]
  startArrowhead: Arrowhead | null
  endArrowhead: Arrowhead | null
  elbowed: boolean
  pressures: number[]
  simulatePressure: boolean
  /** A freedraw's stroke: pressure-shaped ("variable") or of one width. */
  strokeOptions: { variability: "variable" | "constant"; streamline: number }
  // Text.
  text: string
  originalText: string
  fontSize: number
  fontFamily: number
  textAlign: string
  lineHeight: number
  // Images.
  fileId: string | null
  scale: Point
  crop: {
    x: number
    y: number
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null
  // Frames.
  name: string | null
  /** When it was made, in epoch ms: a sticky note's footer shows the date. */
  created: number | null
}

const ARROWHEADS = new Set<string>([
  "arrow",
  "bar",
  "circle",
  "circle_outline",
  "triangle",
  "triangle_outline",
  "diamond",
  "diamond_outline",
  "cardinality_one",
  "cardinality_many",
  "cardinality_one_or_many",
  "cardinality_exactly_one",
  "cardinality_zero_or_one",
  "cardinality_zero_or_many",
])

/** Names older files use (Excalidraw's normalizeArrowhead). */
const LEGACY_ARROWHEADS: Record<string, Arrowhead> = {
  dot: "circle",
  crowfoot_one: "cardinality_one",
  crowfoot_many: "cardinality_many",
  crowfoot_one_or_many: "cardinality_one_or_many",
}

// Excalidraw's sticky note defaults and floor (STICKY_NOTE_MIN_SIZE).
const STICKY_NOTE_BACKGROUND = "#ffdf6b"
const STICKY_NOTE_MIN_SIZE = 75
const STICKY_NOTE_DEFAULT_SIZE = 250

export const isTransparent = (color: string) =>
  color === "transparent" ||
  (color.length === 5 && color[4] === "0") ||
  (color.length === 9 && color.slice(7) === "00")

const num = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback
const str = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback
const strOrNull = (value: unknown) =>
  typeof value === "string" && value ? value : null
const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const point = (value: unknown): Point | null =>
  Array.isArray(value) ? [num(value[0]), num(value[1])] : null

/** An arrowhead this version can't draw is left out. */
function arrowhead(value: unknown, fallback: Arrowhead | null) {
  if (value === undefined) return fallback
  if (typeof value !== "string") return null
  return (
    LEGACY_ARROWHEADS[value] ??
    (ARROWHEADS.has(value) ? (value as Arrowhead) : null)
  )
}

export function readElement(raw: Record<string, unknown>): Element {
  const type = str(raw.type)
  const roundness = isObject(raw.roundness)
    ? {
        type: num(raw.roundness.type),
        value:
          typeof raw.roundness.value === "number"
            ? raw.roundness.value
            : undefined,
      }
    : null
  const boundElements = Array.isArray(raw.boundElements)
    ? raw.boundElements
    : []
  const boundText = boundElements.find(
    (bound) => isObject(bound) && bound.type === "text",
  )
  const crop = isObject(raw.crop)
    ? {
        x: num(raw.crop.x),
        y: num(raw.crop.y),
        width: num(raw.crop.width, 1),
        height: num(raw.crop.height, 1),
        naturalWidth: num(raw.crop.naturalWidth, 1),
        naturalHeight: num(raw.crop.naturalHeight, 1),
      }
    : null
  const strokeStyle = str(raw.strokeStyle)
  const text = str(raw.text)
  const fontFamily = num(raw.fontFamily, 5)
  const strokeOptions = isObject(raw.strokeOptions) ? raw.strokeOptions : {}
  const element: Element = {
    id: str(raw.id),
    type,
    x: num(raw.x),
    y: num(raw.y),
    width: num(raw.width),
    height: num(raw.height),
    angle: num(raw.angle),
    strokeColor: str(raw.strokeColor) || "#1e1e1e",
    backgroundColor: str(raw.backgroundColor) || "transparent",
    fillStyle: str(raw.fillStyle) || "solid",
    strokeWidth: num(raw.strokeWidth, 2),
    strokeStyle:
      strokeStyle === "dashed" || strokeStyle === "dotted"
        ? strokeStyle
        : "solid",
    roughness: num(raw.roughness, 1),
    opacity: num(raw.opacity, 100),
    seed: num(raw.seed, 1),
    roundness,
    frameId: strOrNull(raw.frameId),
    boundTextId: isObject(boundText) ? strOrNull(boundText.id) : null,
    containerId: strOrNull(raw.containerId),
    link: strOrNull(raw.link),
    points: Array.isArray(raw.points)
      ? raw.points.flatMap((value) => {
          const at = point(value)
          return at ? [at] : []
        })
      : [],
    startArrowhead: arrowhead(raw.startArrowhead, null),
    endArrowhead: arrowhead(
      raw.endArrowhead,
      type === "arrow" ? "arrow" : null,
    ),
    elbowed: raw.elbowed === true,
    pressures: Array.isArray(raw.pressures)
      ? raw.pressures.map((value) => num(value, 0.5))
      : [],
    simulatePressure: raw.simulatePressure !== false,
    strokeOptions: {
      variability:
        strokeOptions.variability === "constant" ? "constant" : "variable",
      streamline: num(strokeOptions.streamline, 0.5),
    },
    text,
    originalText: str(raw.originalText, text),
    fontSize: num(raw.fontSize, 20),
    fontFamily,
    textAlign: str(raw.textAlign, "left"),
    lineHeight: num(raw.lineHeight) || defaultLineHeight(fontFamily),
    fileId: strOrNull(raw.fileId),
    scale: point(raw.scale) ?? [1, 1],
    crop,
    name: strOrNull(raw.name),
    created: typeof raw.created === "number" ? raw.created : null,
  }
  return type === "stickynote" ? stickyNote(element, raw) : element
}

/** Excalidraw's normalizeStickyNote: always filled, never under its floor. */
function stickyNote(element: Element, raw: Record<string, unknown>): Element {
  const baseHeight = Math.max(
    num(raw.baseHeight) || element.height || STICKY_NOTE_DEFAULT_SIZE,
    STICKY_NOTE_MIN_SIZE,
  )
  return {
    ...element,
    backgroundColor: isTransparent(element.backgroundColor)
      ? STICKY_NOTE_BACKGROUND
      : element.backgroundColor,
    strokeColor: isTransparent(element.strokeColor)
      ? "#1e1e1e"
      : element.strokeColor,
    width: Math.max(element.width, STICKY_NOTE_MIN_SIZE),
    height: Math.max(element.height, baseHeight),
  }
}
