// Build-time Excalidraw-style shapes. rough.js (the library Excalidraw draws with) turns
// geometry into wobbly SVG paths; <Sketch> renders them and the page script draws strokes in.
import rough from "roughjs"
import type { Drawable, Options } from "roughjs/bin/core"

const gen = rough.generator()

export const ink = "#1e1e1e"
export const pen = "#5f56c0"
export const fills = {
  blue: "#a5d8ff",
  green: "#b2f2bb",
  yellow: "#ffec99",
  red: "#ffc9c9",
  violet: "#d0bfff",
}

/** One path. `draw` strokes animate in like a pen; the rest fade in. */
export type Part = { d: string; stroke?: string; width?: number; fill?: string; draw: boolean }

type ShapeOptions = { seed: number; fill?: string; hachure?: boolean; stroke?: string; width?: number; roughness?: number }

function options({ seed, fill, hachure, stroke = ink, width = 2, roughness = 1 }: ShapeOptions): Options {
  return {
    seed,
    stroke,
    strokeWidth: width,
    roughness,
    fill,
    fillStyle: hachure ? "hachure" : "solid",
    hachureGap: 9,
    hachureAngle: -41,
    fillWeight: width / 2,
    preserveVertices: true,
  }
}

function parts(drawable: Drawable): Part[] {
  const o = drawable.options
  return drawable.sets.flatMap((set): Part[] => {
    const d = gen.opsToPath(set, 2)
    if (set.type === "fillPath") return [{ d, fill: o.fill, draw: false }]
    if (set.type === "fillSketch") return [{ d, stroke: o.fill, width: o.fillWeight, draw: false }]
    if (o.stroke === "none") return []
    // Each subpath is one pen pass, so it draws in on its own.
    return d.split(/(?=M)/).map((sub) => ({ d: sub.trim(), stroke: o.stroke, width: o.strokeWidth, draw: true }))
  })
}

const roundRect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y} L${x + w - r} ${y} Q${x + w} ${y} ${x + w} ${y + r} L${x + w} ${y + h - r} Q${x + w} ${y + h} ${x + w - r} ${y + h} L${x + r} ${y + h} Q${x} ${y + h} ${x} ${y + h - r} L${x} ${y + r} Q${x} ${y} ${x + r} ${y}`

export const rect = (x: number, y: number, w: number, h: number, o: ShapeOptions & { r?: number }) =>
  parts(gen.path(roundRect(x, y, w, h, o.r ?? 12), options(o)))

export const ellipse = (cx: number, cy: number, w: number, h: number, o: ShapeOptions) =>
  parts(gen.ellipse(cx, cy, w, h, options(o)))

export const line = (points: [number, number][], o: ShapeOptions) =>
  parts(points.length > 2 ? gen.curve(points, options(o)) : gen.linearPath(points, options(o)))

/** A line through `points` with an Excalidraw arrowhead at the end. */
export function arrow(points: [number, number][], o: ShapeOptions & { head?: number }) {
  const [x1, y1] = points[points.length - 2]
  const [x2, y2] = points[points.length - 1]
  const angle = Math.atan2(y2 - y1, x2 - x1)
  const size = o.head ?? 18
  const wing = (side: number): [number, number] => [
    x2 - size * Math.cos(angle + side * 0.5),
    y2 - size * Math.sin(angle + side * 0.5),
  ]
  return [
    ...line(points, o),
    ...line([wing(1), [x2, y2], wing(-1)], { ...o, seed: o.seed + 1 }),
  ]
}

/** The database cylinder: top ellipse, sides, front arc of the base. */
export function cylinder(cx: number, top: number, bottom: number, rx: number, ry: number, o: ShapeOptions) {
  const l = cx - rx
  const r = cx + rx
  return [
    ...parts(gen.path(`M${l} ${top} L${l} ${bottom} A${rx} ${ry} 0 0 0 ${r} ${bottom} L${r} ${top}`, options(o))),
    ...ellipse(cx, top, rx * 2, ry * 2, { ...o, seed: o.seed + 1 }),
  ]
}

/** Hachure fill for the cylinder body, used as the rising "stored" level. */
export function cylinderFill(cx: number, top: number, bottom: number, rx: number, ry: number, o: ShapeOptions) {
  const l = cx - rx
  const r = cx + rx
  const body = `M${l} ${top} L${l} ${bottom} A${rx} ${ry} 0 0 0 ${r} ${bottom} L${r} ${top} A${rx} ${ry} 0 0 1 ${l} ${top} Z`
  return parts(gen.path(body, { ...options({ ...o, hachure: true }), stroke: "none" }))
}
