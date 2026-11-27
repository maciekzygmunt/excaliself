// The element JSON Excalidraw can open, shared by MCP scene and library imports.
import { z } from "zod"

const num = z.number()
const point = z.tuple([num, num])
const binding = z
  .looseObject({
    elementId: z.string(),
    focus: num.optional(),
    gap: num.optional(),
    fixedPoint: point.nullable().optional(),
  })
  .nullable()
  .optional()
const arrowhead = z.string().nullable().optional()

const common = {
  x: num,
  y: num,
  width: num.optional(),
  height: num.optional(),
  angle: num.optional(),
  strokeColor: z.string().optional(),
  backgroundColor: z.string().optional(),
  fillStyle: z.string().optional(),
  strokeStyle: z.string().optional(),
  strokeWidth: num.optional(),
  roughness: num.optional(),
  opacity: num.optional(),
  seed: num.optional(),
  updated: num.optional(),
  groupIds: z.array(z.string()).optional(),
  frameId: z.string().nullable().optional(),
  roundness: z
    .looseObject({ type: num, value: num.optional() })
    .nullable()
    .optional(),
  boundElements: z
    .array(z.looseObject({ id: z.string(), type: z.enum(["arrow", "text"]) }))
    .nullable()
    .optional(),
  isDeleted: z.boolean().optional(),
  link: z.string().nullable().optional(),
  locked: z.boolean().optional(),
}

const linear = {
  ...common,
  // Required: restore() reads points.length before it repairs anything.
  points: z.array(point),
  startBinding: binding,
  endBinding: binding,
  startArrowhead: arrowhead,
  endArrowhead: arrowhead,
}

const ELEMENT_TYPES = [
  "rectangle",
  "diamond",
  "ellipse",
  "stickynote",
  "text",
  "arrow",
  "line",
  "freedraw",
  "image",
  "frame",
  "magicframe",
  "embeddable",
  "iframe",
] as const

export const sceneElement = z.discriminatedUnion(
  "type",
  [
    z.looseObject({
      type: z.enum(["rectangle", "diamond", "ellipse", "embeddable", "iframe"]),
      ...common,
    }),
    z.looseObject({
      type: z.literal("stickynote"),
      ...common,
      baseHeight: num.optional(),
    }),
    z.looseObject({
      type: z.literal("text"),
      ...common,
      text: z.string(),
      originalText: z.string().optional(),
      fontSize: num.optional(),
      fontFamily: num.optional(),
      lineHeight: num.optional(),
      textAlign: z.string().optional(),
      verticalAlign: z.string().optional(),
      containerId: z.string().nullable().optional(),
      autoResize: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.enum(["arrow", "line"]),
      ...linear,
      elbowed: z.boolean().optional(),
      fixedSegments: z
        .array(z.looseObject({ start: point, end: point, index: num }))
        .nullable()
        .optional(),
    }),
    z.looseObject({
      type: z.literal("freedraw"),
      ...linear,
      pressures: z.array(num),
      simulatePressure: z.boolean().optional(),
    }),
    z.looseObject({
      type: z.literal("image"),
      ...common,
      fileId: z.string().nullable().optional(),
      status: z.string().optional(),
      scale: point.optional(),
      crop: z.looseObject({}).nullable().optional(),
    }),
    z.looseObject({
      type: z.enum(["frame", "magicframe"]),
      ...common,
      name: z.string().nullable().optional(),
    }),
  ],
  { error: `Unknown element type. Use one of: ${ELEMENT_TYPES.join(", ")}.` },
)
