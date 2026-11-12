// Rough.js shapes and bounds for an element, ported from Excalidraw
// (element/src/shape.ts and bounds.ts, MIT). Same roughjs version and seeds,
// so strokes come out exactly as on the canvas.

import { simplify } from "points-on-curve"
import type { Drawable, Op, Options } from "roughjs/bin/core"
import { RoughGenerator } from "roughjs/bin/generator"
import type { Point as RoughPoint } from "roughjs/bin/geometry"
import {
  type Arrowhead,
  type Element,
  isTransparent,
  type Point,
} from "./elements"

export type Bounds = [minX: number, minY: number, maxX: number, maxY: number]

export const generator = new RoughGenerator()

export const LINEAR_TYPES = new Set(["line", "arrow"])
const ROUNDNESS = { LEGACY: 1, PROPORTIONAL_RADIUS: 2, ADAPTIVE_RADIUS: 3 }
const DEFAULT_PROPORTIONAL_RADIUS = 0.25
const DEFAULT_ADAPTIVE_RADIUS = 32
const LINE_CONFIRM_THRESHOLD = 8
const ELBOW_ARROW_CORNER_RADIUS = 16
// Excalidraw's canChangeRoundness.
const ROUNDABLE = new Set([
  "rectangle",
  "iframe",
  "embeddable",
  "line",
  "diamond",
  "stickynote",
  "image",
])

export const rotate = (
  [x, y]: Point,
  [cx, cy]: Point,
  angle: number,
): [number, number] => [
  (x - cx) * Math.cos(angle) - (y - cy) * Math.sin(angle) + cx,
  (x - cx) * Math.sin(angle) + (y - cy) * Math.cos(angle) + cy,
]

export function getCornerRadius(x: number, element: Element) {
  const type = element.roundness?.type
  if (type === ROUNDNESS.PROPORTIONAL_RADIUS || type === ROUNDNESS.LEGACY) {
    return x * DEFAULT_PROPORTIONAL_RADIUS
  }
  if (type === ROUNDNESS.ADAPTIVE_RADIUS) {
    const fixed = element.roundness?.value ?? DEFAULT_ADAPTIVE_RADIUS
    return x <= fixed / DEFAULT_PROPORTIONAL_RADIUS
      ? x * DEFAULT_PROPORTIONAL_RADIUS
      : fixed
  }
  return 0
}

export function isPathALoop(points: readonly Point[]) {
  if (points.length < 3) return false
  const [first, last] = [points[0], points[points.length - 1]]
  return (
    Math.hypot(first[0] - last[0], first[1] - last[1]) <= LINE_CONFIRM_THRESHOLD
  )
}

const dashed = (strokeWidth: number) => [8, 8 + strokeWidth]
const dotted = (strokeWidth: number) => [1.5, 6 + strokeWidth]

function adjustRoughness(element: Element) {
  const maxSize = Math.max(element.width, element.height)
  const minSize = Math.min(element.width, element.height)
  if (
    (minSize >= 20 && maxSize >= 50) ||
    (minSize >= 15 && !!element.roundness && ROUNDABLE.has(element.type)) ||
    (LINEAR_TYPES.has(element.type) && maxSize >= 50)
  ) {
    return element.roughness
  }
  return Math.min(element.roughness / (maxSize < 10 ? 3 : 2), 2.5)
}

function roughOptions(element: Element, continuousPath = false): Options {
  const options: Options = {
    seed: element.seed,
    strokeLineDash:
      element.strokeStyle === "dashed"
        ? dashed(element.strokeWidth)
        : element.strokeStyle === "dotted"
          ? dotted(element.strokeWidth)
          : undefined,
    disableMultiStroke: element.strokeStyle !== "solid",
    strokeWidth:
      element.strokeStyle !== "solid"
        ? element.strokeWidth + 0.5
        : element.strokeWidth,
    fillWeight: element.strokeWidth / 2,
    hachureGap: element.strokeWidth * 4,
    roughness: adjustRoughness(element),
    stroke: element.strokeColor,
    preserveVertices: continuousPath || element.roughness < 2,
  }
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable":
    case "diamond":
    case "ellipse":
      options.fillStyle = element.fillStyle
      options.fill = isTransparent(element.backgroundColor)
        ? undefined
        : element.backgroundColor
      if (element.type === "ellipse") options.curveFitting = 1
      return options
    case "line":
    case "freedraw":
      if (isPathALoop(element.points)) {
        options.fillStyle = element.fillStyle
        options.fill =
          element.backgroundColor === "transparent"
            ? undefined
            : element.backgroundColor
      }
      return options
    default:
      return options
  }
}

/** Export draws an iframe-like element as a placeholder box. */
function placeholder(element: Element): Element {
  if (
    isTransparent(element.backgroundColor) &&
    isTransparent(element.strokeColor)
  ) {
    return {
      ...element,
      roughness: 0,
      backgroundColor: "#d3d3d3",
      fillStyle: "solid",
    }
  }
  if (element.type === "iframe") {
    return {
      ...element,
      strokeColor: isTransparent(element.strokeColor)
        ? "#000000"
        : element.strokeColor,
      backgroundColor: isTransparent(element.backgroundColor)
        ? "#f4f4f6"
        : element.backgroundColor,
    }
  }
  return element
}

export function getDiamondPoints(element: Element) {
  const topX = Math.floor(element.width / 2) + 1
  const rightY = Math.floor(element.height / 2) + 1
  return [topX, 0, element.width, rightY, topX, element.height, 0, rightY]
}

/** The path ops of a shape's outline (its first "path" set). */
export function curvePathOps(shape: Drawable | undefined): Op[] {
  if (!shape) return []
  for (const set of shape.sets) {
    if (set.type === "path") return set.ops
  }
  return shape.sets[0]?.ops ?? []
}

// Where the parts of a composite cardinality marker sit, in multiples of the
// part's size (negative: toward the tip).
const ONE_OR_MANY_BAR_OFFSET = -0.25
const INNER_BAR_OFFSET = -0.5
const ZERO_CIRCLE_OFFSET = 1.5
const ZERO_CIRCLE_SCALE = 0.8

const isCardinality = (arrowhead: Arrowhead) =>
  arrowhead.startsWith("cardinality_")

function arrowheadSize(arrowhead: Arrowhead) {
  switch (arrowhead) {
    case "arrow":
      return 25
    case "diamond":
    case "diamond_outline":
      return 12
    case "cardinality_one":
    case "cardinality_exactly_one":
    case "cardinality_zero_or_one":
      return 20
    default:
      return 15
  }
}

/** In degrees. An "arrow" drawn smaller opens up, to stay off the line. */
function arrowheadAngle(arrowhead: Arrowhead, size = arrowheadSize(arrowhead)) {
  if (arrowhead === "bar") return 90
  if (arrowhead !== "arrow") return 25
  const fullSize = arrowheadSize(arrowhead)
  const shrinkage = Math.min(
    Math.max((fullSize - size) / (fullSize - 10), 0),
    1,
  )
  return 20 + 10 * shrinkage
}

const radians = (degrees: number) => (degrees * Math.PI) / 180

type Corner = { length: number; prevLength: number; turn: number }

/**
 * The arrow's last segment at one end, and how far the arrow turns into it
 * from the segment before. Null when there is no segment before.
 */
function arrowheadCorner(
  element: Element,
  position: "start" | "end",
): Corner | null {
  const { points } = element
  const [tip, corner, prev] =
    position === "end"
      ? [points.at(-1), points.at(-2), points.at(-3)]
      : [points[0], points[1], points[2]]
  if (!tip || !corner || !prev) return null
  let length = Math.hypot(tip[0] - corner[0], tip[1] - corner[1])
  let prevLength = Math.hypot(corner[0] - prev[0], corner[1] - prev[1])
  if (length === 0 || prevLength === 0) return null
  // An elbow arrow turns halfway into its rounded corner.
  if (element.elbowed) {
    const rounding =
      Math.min(ELBOW_ARROW_CORNER_RADIUS, length / 2, prevLength / 2) / 2
    length -= rounding
    prevLength -= rounding
  }
  const dot =
    (tip[0] - corner[0]) * (corner[0] - prev[0]) +
    (tip[1] - corner[1]) * (corner[1] - prev[1])
  const cos = dot / (length * prevLength)
  return { length, prevLength, turn: Math.acos(Math.min(Math.max(cos, -1), 1)) }
}

/**
 * The size up to which an arrowhead reaching past the last segment keeps its
 * sides (at `sideAngle`) `clearance` away from the segment before.
 */
function sidesClearSize(
  { length, turn }: Corner,
  sideAngle: number,
  clearance: number,
) {
  const angle = radians(sideAngle)
  if (turn <= angle) return Infinity
  return (length * Math.sin(turn) - clearance) / Math.sin(turn - angle)
}

/** The scale (at most 1) at which a whole cardinality marker fits the last segment. */
function cardinalityScale(
  marker: Arrowhead,
  { length, turn }: Corner,
  strokeWidth: number,
) {
  const bar = (offset: number) => {
    const angle = radians(arrowheadAngle("cardinality_one"))
    return (
      length /
      (arrowheadSize("cardinality_one") *
        (offset + Math.cos(angle) + Math.sin(angle) * Math.tan(turn / 2)))
    )
  }
  const crowsFoot = length / arrowheadSize("cardinality_many")
  const circle =
    (length - ((strokeWidth - 2) * ZERO_CIRCLE_SCALE) / 2 - strokeWidth) /
    (arrowheadSize("circle_outline") *
      (ZERO_CIRCLE_OFFSET + ZERO_CIRCLE_SCALE / 2))
  switch (marker) {
    case "cardinality_one":
      return Math.min(1, bar(0))
    case "cardinality_many":
      return Math.min(1, crowsFoot)
    case "cardinality_one_or_many":
      return Math.min(1, crowsFoot, bar(ONE_OR_MANY_BAR_OFFSET))
    case "cardinality_exactly_one":
      return Math.min(1, bar(INNER_BAR_OFFSET), bar(0))
    case "cardinality_zero_or_one":
      return Math.min(1, circle, bar(INNER_BAR_OFFSET))
    default:
      return Math.min(1, crowsFoot, circle)
  }
}

/**
 * The size an arrowhead (or one part of a marker) may grow to when the last
 * segment is too short for it. 0 when it shouldn't grow.
 */
function sizeBeyondLastSegment(
  element: Element,
  position: "start" | "end",
  arrowhead: Arrowhead,
) {
  const corner = arrowheadCorner(element, position)
  if (!corner) return 0
  const { length, prevLength, turn } = corner
  const maxSize = (length + prevLength) / 2
  const isCurved = !!element.roundness && !element.elbowed
  const marker =
    position === "start" ? element.startArrowhead : element.endArrowhead
  // A marker's parts scale together, and stay on the last segment.
  if (marker && isCardinality(marker)) {
    return isCurved
      ? 0
      : arrowheadSize(arrowhead) *
          cardinalityScale(marker, corner, element.strokeWidth)
  }
  if (arrowhead === "circle" || arrowhead === "circle_outline") return maxSize
  if (isCurved) return 0
  switch (arrowhead) {
    case "bar":
      return Math.min(maxSize, length / Math.tan(turn / 2))
    case "diamond":
    case "diamond_outline":
      return length / 2
    case "triangle":
    case "triangle_outline":
      return Math.min(
        maxSize,
        sidesClearSize(corner, arrowheadAngle(arrowhead), 0),
      )
    case "arrow": {
      const legibleSize = arrowheadSize(arrowhead) / 2
      return Math.min(
        legibleSize,
        maxSize,
        sidesClearSize(
          corner,
          arrowheadAngle(arrowhead, legibleSize),
          element.strokeWidth,
        ),
        sidesClearSize(
          corner,
          arrowheadAngle(arrowhead, 0),
          element.strokeWidth,
        ),
      )
    }
    default:
      return 0
  }
}

/** `offsetMultiplier` moves the part back from the tip, in its own sizes. */
function arrowheadPoints(
  element: Element,
  shape: Drawable[],
  position: "start" | "end",
  arrowhead: Arrowhead,
  offsetMultiplier = 0,
): number[] | null {
  const ops = curvePathOps(shape[0])
  if (ops.length < 1) return null
  const index = position === "start" ? 1 : ops.length - 1
  const data = ops[index]?.data
  if (data?.length !== 6) return null

  const p3: Point = [data[4], data[5]]
  const p2: Point = [data[2], data[3]]
  const p1: Point = [data[0], data[1]]
  const prevOp = ops[index - 1]
  let p0: Point = [0, 0]
  if (prevOp.op === "move") p0 = [prevOp.data[0], prevOp.data[1]]
  else if (prevOp.op === "bcurveTo") p0 = [prevOp.data[4], prevOp.data[5]]

  const equation = (t: number, i: 0 | 1) =>
    (1 - t) ** 3 * p3[i] +
    3 * t * (1 - t) ** 2 * p2[i] +
    3 * t ** 2 * (1 - t) * p1[i] +
    p0[i] * t ** 3
  const [x2, y2] = position === "start" ? p0 : p3
  const [x1, y1] = [equation(0.3, 0), equation(0.3, 1)]
  const distance = Math.hypot(x2 - x1, y2 - y1)
  const nx = (x2 - x1) / distance
  const ny = (y2 - y1) / distance

  const { points } = element
  const [cx, cy] = position === "end" ? points[points.length - 1] : points[0]
  const [px, py] =
    points.length > 1
      ? position === "end"
        ? points[points.length - 2]
        : points[1]
      : [0, 0]
  const length = Math.hypot(cx - px, cy - py)

  const size = arrowheadSize(arrowhead)
  const lengthMultiplier =
    arrowhead === "diamond" || arrowhead === "diamond_outline" ? 0.25 : 0.5
  let minSize = Math.min(size, length * lengthMultiplier)
  if (minSize < size) {
    minSize = Math.min(
      size,
      Math.max(minSize, sizeBeyondLastSegment(element, position, arrowhead)),
    )
  }
  const tx = x2 - nx * minSize * offsetMultiplier
  const ty = y2 - ny * minSize * offsetMultiplier
  const xs = tx - nx * minSize
  const ys = ty - ny * minSize

  if (arrowhead === "circle" || arrowhead === "circle_outline") {
    const diameter = Math.hypot(ys - ty, xs - tx) + element.strokeWidth - 2
    return [tx, ty, diameter]
  }

  const angle = arrowheadAngle(arrowhead, minSize)
  if (
    arrowhead === "cardinality_many" ||
    arrowhead === "cardinality_one_or_many"
  ) {
    const [x3, y3] = rotate([tx, ty], [xs, ys], radians(-angle))
    const [x4, y4] = rotate([tx, ty], [xs, ys], radians(angle))
    return [xs, ys, x3, y3, x4, y4]
  }

  const [x3, y3] = rotate([xs, ys], [tx, ty], radians(-angle))
  const [x4, y4] = rotate([xs, ys], [tx, ty], radians(angle))

  if (arrowhead === "diamond" || arrowhead === "diamond_outline") {
    let ox: number
    let oy: number
    if (position === "start") {
      const [px, py] = points.length > 1 ? points[1] : [0, 0]
      ;[ox, oy] = rotate(
        [tx + minSize * 2, ty],
        [tx, ty],
        Math.atan2(py - ty, px - tx),
      )
    } else {
      const [px, py] = points.length > 1 ? points[points.length - 2] : [0, 0]
      ;[ox, oy] = rotate(
        [tx - minSize * 2, ty],
        [tx, ty],
        Math.atan2(ty - py, tx - px),
      )
    }
    return [tx, ty, x3, y3, ox, oy, x4, y4]
  }

  return [tx, ty, x3, y3, x4, y4]
}

/**
 * Fills an arrowhead's outline (one rough stroke) along that stroke: rough.js
 * jitters its own solid fill apart from the outline, which shows at this size.
 */
function fillOutline(outline: Drawable, fill: string): Drawable {
  // A polygon is drawn edge by edge, each starting with a move.
  const ops = outline.sets
    .flatMap((set) => set.ops)
    .map((op, index) =>
      index > 0 && op.op === "move" ? { ...op, op: "lineTo" as const } : op,
    )
  return {
    ...outline,
    options: { ...outline.options, fill },
    sets: [{ type: "fillPath", ops }, ...outline.sets],
  }
}

function arrowheadShapes(
  element: Element,
  shape: Drawable[],
  position: "start" | "end",
  arrowhead: Arrowhead,
  options: Options,
  canvasBackgroundColor: string,
): Drawable[] {
  const pointsOf = (part: Arrowhead = arrowhead, offset = 0) =>
    arrowheadPoints(element, shape, position, part, offset)

  const lineOptions = { ...options }
  if (element.strokeStyle === "dotted") {
    // Dotted arrow caps get a smaller gap, so they stay legible.
    const dash = dotted(element.strokeWidth - 1)
    lineOptions.strokeLineDash = [dash[0], dash[1] - 1]
  } else {
    delete lineOptions.strokeLineDash
  }
  lineOptions.roughness = Math.min(1, lineOptions.roughness || 0)

  const linesToTip = (points: number[] | null) => {
    if (!points) return []
    const [x2, y2, x3, y3, x4, y4] = points
    return [
      generator.line(x3, y3, x2, y2, lineOptions),
      generator.line(x4, y4, x2, y2, lineOptions),
    ]
  }
  const bar = (points: number[] | null) => {
    if (!points) return []
    const [, , x3, y3, x4, y4] = points
    return [generator.line(x3, y3, x4, y4, lineOptions)]
  }
  // Outlines are one solid stroke: a second one would stray from the fill.
  const circle = (points: number[] | null, fill: string, scale = 1) => {
    if (!points) return []
    const [x, y, diameter] = points
    const circleOptions: Options = {
      ...options,
      stroke: element.strokeColor,
      roughness: Math.min(0.5, options.roughness || 0),
      disableMultiStroke: true,
    }
    delete circleOptions.strokeLineDash
    return [
      fillOutline(
        generator.circle(x, y, diameter * scale, circleOptions),
        fill,
      ),
    ]
  }
  const polygon = (corners: RoughPoint[], fill: string) => {
    const polygonOptions: Options = {
      ...options,
      roughness: Math.min(1, options.roughness || 0),
      disableMultiStroke: true,
      // The small polygon's corners stay in place; only its edges bow.
      preserveVertices: true,
    }
    delete polygonOptions.strokeLineDash
    return [fillOutline(generator.polygon(corners, polygonOptions), fill)]
  }
  const fillOf = (outlined: boolean) =>
    outlined ? canvasBackgroundColor : element.strokeColor
  const zeroCircle = () =>
    circle(
      pointsOf("circle_outline", ZERO_CIRCLE_OFFSET),
      canvasBackgroundColor,
      ZERO_CIRCLE_SCALE,
    )

  switch (arrowhead) {
    case "circle":
    case "circle_outline":
      return circle(pointsOf(), fillOf(arrowhead === "circle_outline"))
    case "triangle":
    case "triangle_outline": {
      const points = pointsOf()
      if (!points) return []
      const [x, y, x2, y2, x3, y3] = points
      return polygon(
        [
          [x, y],
          [x2, y2],
          [x3, y3],
        ],
        fillOf(arrowhead === "triangle_outline"),
      )
    }
    case "diamond":
    case "diamond_outline": {
      const points = pointsOf()
      if (!points) return []
      const [x, y, x2, y2, x3, y3, x4, y4] = points
      return polygon(
        [
          [x, y],
          [x2, y2],
          [x3, y3],
          [x4, y4],
        ],
        fillOf(arrowhead === "diamond_outline"),
      )
    }
    case "cardinality_one":
      return bar(pointsOf())
    case "cardinality_one_or_many":
      return [
        ...linesToTip(pointsOf("cardinality_many")),
        ...bar(pointsOf("cardinality_one", ONE_OR_MANY_BAR_OFFSET)),
      ]
    case "cardinality_exactly_one":
      return [
        ...bar(pointsOf("cardinality_one", INNER_BAR_OFFSET)),
        ...bar(pointsOf("cardinality_one")),
      ]
    case "cardinality_zero_or_one":
      return [
        ...zeroCircle(),
        ...bar(pointsOf("cardinality_one", INNER_BAR_OFFSET)),
      ]
    case "cardinality_zero_or_many":
      return [...linesToTip(pointsOf("cardinality_many")), ...zeroCircle()]
    default:
      return linesToTip(pointsOf())
  }
}

/** Whether the step from `b` to `a` heads left or right. */
const isHorizontal = (a: Point, b: Point) =>
  Math.abs(a[0] - b[0]) > 1e-4 && Math.abs(a[0] - b[0]) >= Math.abs(a[1] - b[1])

function elbowArrowPath(route: readonly Point[], radius: number) {
  const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1])
  // A jog too short to see (under 1px, between two longer segments heading
  // the same way) is drawn straight: rough.js draws its corners as a knot.
  const isJog = (i: number) => {
    if (i < 2 || i > route.length - 2) return false
    const [a, b, c, d] = route.slice(i - 2, i + 2)
    return (
      distance(b, c) < 1 &&
      distance(a, b) >= 1 &&
      distance(c, d) >= 1 &&
      (b[0] - a[0]) * (d[0] - c[0]) + (b[1] - a[1]) * (d[1] - c[1]) > 0
    )
  }
  const points = route.filter((_, i) => !isJog(i) && !isJog(i + 1))
  const subpoints: Point[] = []
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const next = points[i + 1]
    const point = points[i]
    const corner = Math.min(
      radius,
      distance(point, next) / 2,
      distance(point, prev) / 2,
    )
    const toward = (other: Point, horizontal: boolean): Point =>
      horizontal
        ? [point[0] + (other[0] < point[0] ? -corner : corner), point[1]]
        : [point[0], point[1] + (other[1] < point[1] ? -corner : corner)]
    subpoints.push(toward(prev, isHorizontal(point, prev)))
    subpoints.push(point)
    subpoints.push(toward(next, isHorizontal(next, point)))
  }
  const d = [`M ${points[0][0]} ${points[0][1]}`]
  for (let i = 0; i < subpoints.length; i += 3) {
    d.push(`L ${subpoints[i][0]} ${subpoints[i][1]}`)
    d.push(
      `Q ${subpoints[i + 1][0]} ${subpoints[i + 1][1]}, ${subpoints[i + 2][0]} ${subpoints[i + 2][1]}`,
    )
  }
  const last = points[points.length - 1]
  d.push(`L ${last[0]} ${last[1]}`)
  return d.join(" ")
}

/**
 * The element's rough.js drawables, in local coordinates (origin at x/y).
 * Empty for text, images, and frames, which aren't drawn with rough.js.
 */
export function generateShape(
  element: Element,
  canvasBackgroundColor: string,
): Drawable[] {
  switch (element.type) {
    case "rectangle":
    case "iframe":
    case "embeddable": {
      const source =
        element.type === "rectangle" ? element : placeholder(element)
      if (element.roundness) {
        const w = element.width
        const h = element.height
        const r = getCornerRadius(Math.min(w, h), element)
        return [
          generator.path(
            `M ${r} 0 L ${w - r} 0 Q ${w} 0, ${w} ${r} L ${w} ${h - r} Q ${w} ${h}, ${w - r} ${h} L ${r} ${h} Q 0 ${h}, 0 ${h - r} L 0 ${r} Q 0 0, ${r} 0`,
            roughOptions(source, true),
          ),
        ]
      }
      return [
        generator.rectangle(
          0,
          0,
          element.width,
          element.height,
          roughOptions(source, false),
        ),
      ]
    }
    case "diamond": {
      const [topX, topY, rightX, rightY, bottomX, bottomY, leftX, leftY] =
        getDiamondPoints(element)
      if (element.roundness) {
        const v = getCornerRadius(Math.abs(topX - leftX), element)
        const h = getCornerRadius(Math.abs(rightY - topY), element)
        return [
          generator.path(
            `M ${topX + v} ${topY + h} L ${rightX - v} ${rightY - h}
            C ${rightX} ${rightY}, ${rightX} ${rightY}, ${rightX - v} ${rightY + h}
            L ${bottomX + v} ${bottomY - h}
            C ${bottomX} ${bottomY}, ${bottomX} ${bottomY}, ${bottomX - v} ${bottomY - h}
            L ${leftX + v} ${leftY + h}
            C ${leftX} ${leftY}, ${leftX} ${leftY}, ${leftX + v} ${leftY - h}
            L ${topX - v} ${topY + h}
            C ${topX} ${topY}, ${topX} ${topY}, ${topX + v} ${topY + h}`,
            roughOptions(element, true),
          ),
        ]
      }
      return [
        generator.polygon(
          [
            [topX, topY],
            [rightX, rightY],
            [bottomX, bottomY],
            [leftX, leftY],
          ],
          roughOptions(element),
        ),
      ]
    }
    case "ellipse":
      return [
        generator.ellipse(
          element.width / 2,
          element.height / 2,
          element.width,
          element.height,
          roughOptions(element),
        ),
      ]
    case "line":
    case "arrow": {
      const options = roughOptions(element)
      const points: Point[] = element.points.length ? element.points : [[0, 0]]
      let shape: Drawable[]
      if (element.elbowed) {
        // Excalidraw skips elbow arrows with runaway points.
        shape = points.every(
          ([x, y]) => Math.abs(x) <= 1e6 && Math.abs(y) <= 1e6,
        )
          ? [
              generator.path(
                elbowArrowPath(points, ELBOW_ARROW_CORNER_RADIUS),
                roughOptions(element, true),
              ),
            ]
          : []
      } else if (!element.roundness) {
        shape = [
          options.fill
            ? generator.polygon(points as RoughPoint[], options)
            : generator.linearPath(points as RoughPoint[], options),
        ]
      } else {
        shape = [generator.curve(points as RoughPoint[], options)]
      }
      if (element.type === "arrow") {
        for (const position of ["start", "end"] as const) {
          const arrowhead =
            position === "start" ? element.startArrowhead : element.endArrowhead
          if (arrowhead === null) continue
          shape.push(
            ...arrowheadShapes(
              element,
              shape,
              position,
              arrowhead,
              options,
              canvasBackgroundColor,
            ),
          )
        }
      }
      return shape
    }
    case "freedraw": {
      if (!isPathALoop(element.points)) return []
      // A closed stroke gets a rough fill behind it.
      const simplified = simplify(element.points as RoughPoint[], 0.75)
      return [
        generator.curve(simplified as RoughPoint[], {
          ...roughOptions(element),
          stroke: "none",
        }),
      ]
    }
    default:
      return []
  }
}

function bezierValue(
  t: number,
  p0: number,
  p1: number,
  p2: number,
  p3: number,
) {
  const s = 1 - t
  return s ** 3 * p0 + 3 * s ** 2 * t * p1 + 3 * s * t ** 2 * p2 + t ** 3 * p3
}

/** The extremes of one coordinate of a cubic Bézier, besides its ends. */
function bezierExtremes(p0: number, p1: number, p2: number, p3: number) {
  const i = p1 - p0
  const j = p2 - p1
  const k = p3 - p2
  const a = 3 * i - 6 * j + 3 * k
  const b = 6 * j - 6 * i
  const c = 3 * i
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return []
  const roots =
    a === 0
      ? [-c / b]
      : [
          (-b + Math.sqrt(discriminant)) / (2 * a),
          (-b - Math.sqrt(discriminant)) / (2 * a),
        ]
  return roots
    .filter((t) => t >= 0 && t <= 1)
    .map((t) => bezierValue(t, p0, p1, p2, p3))
}

/** Bounds of the curve's Bézier ops, after `transform`. */
export function curveBounds(
  ops: Op[],
  transform: (point: Point) => Point = (point) => point,
): Bounds {
  let current: Point = [0, 0]
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity]
  for (const { op, data } of ops) {
    if (op === "move") {
      current = [data[0], data[1]]
    } else if (op === "bcurveTo") {
      const p0 = transform(current)
      const p1 = transform([data[0], data[1]])
      const p2 = transform([data[2], data[3]])
      const p3 = transform([data[4], data[5]])
      current = [data[4], data[5]]
      const xs = [p0[0], p3[0], ...bezierExtremes(p0[0], p1[0], p2[0], p3[0])]
      const ys = [p0[1], p3[1], ...bezierExtremes(p0[1], p1[1], p2[1], p3[1])]
      bounds[0] = Math.min(bounds[0], ...xs)
      bounds[1] = Math.min(bounds[1], ...ys)
      bounds[2] = Math.max(bounds[2], ...xs)
      bounds[3] = Math.max(bounds[3], ...ys)
    }
  }
  return bounds
}

const pointsBounds = (points: readonly Point[]): Bounds => [
  Math.min(...points.map(([x]) => x)),
  Math.min(...points.map(([, y]) => y)),
  Math.max(...points.map(([x]) => x)),
  Math.max(...points.map(([, y]) => y)),
]

/** The element's unrotated box: [x1, y1, x2, y2] plus its center. */
export function absoluteCoords(element: Element, shape: Drawable[]) {
  let local: Bounds | null = null
  if (element.type === "freedraw" && element.points.length) {
    local = pointsBounds(element.points)
  } else if (LINEAR_TYPES.has(element.type) && element.points.length) {
    local =
      element.points.length < 2 || !shape[0]
        ? pointsBounds(element.points)
        : curveBounds(curvePathOps(shape[0]))
  }
  const [x1, y1, x2, y2] = local
    ? [
        local[0] + element.x,
        local[1] + element.y,
        local[2] + element.x,
        local[3] + element.y,
      ]
    : [
        element.x,
        element.y,
        element.x + element.width,
        element.y + element.height,
      ]
  return { x1, y1, x2, y2, cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 }
}

/** The element's bounds in scene coordinates, rotation included. */
export function elementBounds(element: Element, shape: Drawable[]): Bounds {
  const { x1, y1, x2, y2, cx, cy } = absoluteCoords(element, shape)
  const { angle } = element
  if (element.type === "freedraw") {
    const [minX, minY, maxX, maxY] = pointsBounds(
      element.points.map((point) =>
        rotate(point, [cx - element.x, cy - element.y], angle),
      ),
    )
    return [
      minX + element.x,
      minY + element.y,
      maxX + element.x,
      maxY + element.y,
    ]
  }
  if (LINEAR_TYPES.has(element.type)) {
    if (element.points.length < 2 || !shape[0]) {
      const [x, y] = rotate(
        [
          element.x + (element.points[0]?.[0] ?? 0),
          element.y + (element.points[0]?.[1] ?? 0),
        ],
        [cx, cy],
        angle,
      )
      return [x, y, x, y]
    }
    return curveBounds(curvePathOps(shape[0]), ([x, y]) =>
      rotate([element.x + x, element.y + y], [cx, cy], angle),
    )
  }
  if (element.type === "diamond") {
    const corners = [
      rotate([cx, y1], [cx, cy], angle),
      rotate([cx, y2], [cx, cy], angle),
      rotate([x1, cy], [cx, cy], angle),
      rotate([x2, cy], [cx, cy], angle),
    ]
    return pointsBounds(corners)
  }
  if (element.type === "ellipse") {
    const w = (x2 - x1) / 2
    const h = (y2 - y1) / 2
    const cos = Math.cos(angle)
    const sin = Math.sin(angle)
    const ww = Math.hypot(w * cos, h * sin)
    const hh = Math.hypot(h * cos, w * sin)
    return [cx - ww, cy - hh, cx + ww, cy + hh]
  }
  return pointsBounds([
    rotate([x1, y1], [cx, cy], angle),
    rotate([x1, y2], [cx, cy], angle),
    rotate([x2, y2], [cx, cy], angle),
    rotate([x2, y1], [cx, cy], angle),
  ])
}
