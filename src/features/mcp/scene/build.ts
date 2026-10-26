// Turns skeletons into the elements Excalidraw stores, without Excalidraw:
// its converter needs a DOM to measure text. Mirrors the editor's own rules
// for bound text (padding, max width, centering) and arrow bindings, so a
// built scene opens as if it had been drawn by hand.

import { randomBytes, randomInt } from "node:crypto"
import type { SceneElement } from "@/features/collab/protocol"
import { type Box, layoutGraph, type Point, union } from "./layout"
import {
  type ConnectorSkeleton,
  MAX_ELEMENTS,
  type SceneGraph,
  SceneInputError,
  type ShapeSkeleton,
  type TextSkeleton,
} from "./skeleton"
import { FONT_SIZE, LINE_HEIGHT, measureText, wrapText } from "./text"

type ShapeType = ShapeSkeleton["type"]

// Excalidraw's BOUND_TEXT_PADDING.
const PADDING = 5
const BINDING_GAP = 6
const MIN_SIZE: Record<ShapeType, [number, number]> = {
  rectangle: [120, 60],
  ellipse: [120, 70],
  diamond: [140, 90],
}
// Labels of auto-sized shapes wrap at this width. Diamonds and ellipses
// grow faster than their text, so they wrap sooner.
const AUTO_WRAP_WIDTH: Record<ShapeType, number> = {
  rectangle: 200,
  ellipse: 160,
  diamond: 130,
}
// Room around a label, on top of Excalidraw's padding.
const LABEL_MARGIN = { x: 16, y: 12 }
const FREE_TEXT_MAX_WIDTH = 600
const CLUSTER_FONT_SIZE = 16
const CLUSTER_STYLE = {
  strokeColor: "#868e96",
  backgroundColor: "#f8f9fa",
  strokeStyle: "dashed",
} as const
// Between hand-placed content and the auto-laid-out block beside it.
const BLOCK_GAP = 100

type Style = {
  strokeColor: string
  backgroundColor: string
  strokeStyle: "solid" | "dashed" | "dotted"
  strokeWidth: number
}

const DEFAULT_STYLE: Style = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  strokeStyle: "solid",
  strokeWidth: 2,
}

type Label = { text: string; original: string; fontSize: number }

type Shape = {
  id: string
  type: ShapeType
  box: Box
  positioned: boolean
  label: Label | null
  style: Style
  /** Ref of the cluster this sits in. */
  parent: string | null
}

/** A subgraph's titled box. Always laid out, around its members. */
type ClusterBox = {
  id: string
  box: Box
  title: Label | null
  /** Ref of the cluster this sits in. */
  parent: string | null
}

/** What an arrow can join. A cluster binds like a rectangle. */
type Target = Shape | ClusterBox

type Connector = {
  id: string
  index: number
  skeleton: ConnectorSkeleton
  label: Label | null
  from: Target | null
  to: Target | null
  /** Set when the auto-layout routed it. */
  route: Point[] | null
}

type FreeText = {
  id: string
  skeleton: TextSkeleton
  layout: ReturnType<typeof freeTextLayout>
  position: Point | null
}

/** A built element, with the fields every element has typed. */
export type BuiltElement = SceneElement & {
  type: string
  x: number
  y: number
  width: number
  height: number
}

/** Builds a scene's elements. Throws SceneInputError listing every problem in the input. */
export function buildScene(graph: SceneGraph): BuiltElement[] {
  // Checked first: layout time grows fast with the number of edges.
  const count = graph.elements.length + graph.clusters.length
  if (count > MAX_ELEMENTS) {
    throw new SceneInputError(
      `This scene has ${count} elements; the limit is ${MAX_ELEMENTS}.`,
    )
  }
  const errors: string[] = []
  // Both keyed by ref. Clusters keep the input's parents-first order.
  const clusters = new Map<string, ClusterBox>()
  const shapes = new Map<string, Shape>()
  const refs = new Set<string>()
  const connectors: Connector[] = []
  const texts: FreeText[] = []

  const claim = (ref: string | undefined, where: string) => {
    if (ref === undefined) return
    if (refs.has(ref)) errors.push(`${where}: id "${ref}" is used twice.`)
    refs.add(ref)
  }

  const clusterOf = new Map<string, string>()
  for (const cluster of graph.clusters) {
    claim(cluster.id, `subgraph ${cluster.id}`)
    for (const member of cluster.members) clusterOf.set(member, cluster.id)
    clusters.set(cluster.id, {
      id: newId(),
      box: { x: 0, y: 0, width: 0, height: 0 },
      title: labelOf(cluster.label, CLUSTER_FONT_SIZE),
      parent: cluster.parent,
    })
  }

  graph.elements.forEach((element, index) => {
    const where = `elements[${index}]`
    claim(element.id, where)
    const checkPosition = ({ x, y }: { x?: number; y?: number }) => {
      if ((x === undefined) !== (y === undefined))
        errors.push(`${where}: give both x and y, or neither.`)
    }
    switch (element.type) {
      case "rectangle":
      case "ellipse":
      case "diamond": {
        checkPosition(element)
        const id = newId()
        // Without an id of its own, keyed by its random element id, which
        // no client id can collide with.
        shapes.set(element.id ?? id, {
          ...sizeShape(element),
          id,
          type: element.type,
          style: {
            ...DEFAULT_STYLE,
            strokeColor: element.strokeColor ?? DEFAULT_STYLE.strokeColor,
            backgroundColor:
              element.backgroundColor ?? DEFAULT_STYLE.backgroundColor,
            strokeStyle: element.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
          },
          parent: (element.id && clusterOf.get(element.id)) || null,
        })
        break
      }
      case "text": {
        checkPosition(element)
        const { x, y } = element
        texts.push({
          id: newId(),
          skeleton: element,
          layout: freeTextLayout(element),
          position: x !== undefined && y !== undefined ? [x, y] : null,
        })
        break
      }
      case "arrow":
      case "line":
        connectors.push({
          id: newId(),
          index,
          skeleton: element,
          label: element.label
            ? labelOf(element.label, element.fontSize ?? FONT_SIZE)
            : null,
          from: null,
          to: null,
          route: null,
        })
        break
    }
  })

  for (const connector of connectors) {
    const where = `elements[${connector.index}]`
    const { from, to, start, end } = connector.skeleton
    const resolve = (ref: string | undefined, field: string) => {
      if (ref === undefined) return null
      const target = shapes.get(ref) ?? clusters.get(ref)
      if (!target) {
        errors.push(
          refs.has(ref)
            ? `${where}.${field}: "${ref}" is not a shape.`
            : `${where}.${field}: no shape has id "${ref}".`,
        )
      }
      return target ?? null
    }
    connector.from = resolve(from, "from")
    connector.to = resolve(to, "to")
    if (from === undefined && start === undefined)
      errors.push(`${where}: give "from" (a shape id) or "start" (a point).`)
    if (to === undefined && end === undefined)
      errors.push(`${where}: give "to" (a shape id) or "end" (a point).`)
  }

  if (errors.length > 0) throw new SceneInputError(errors.join("\n"))

  autoLayout(graph.direction, clusters, shapes, connectors, texts)

  const boundTo = (target: Target) =>
    connectors.flatMap(({ id, from, to }) =>
      from === target || to === target ? [{ id, type: "arrow" as const }] : [],
    )
  // Outer clusters first, so each box sits behind what it holds.
  return withIndices([
    ...[...clusters.values()].flatMap((cluster) =>
      emitCluster(cluster, boundTo(cluster)),
    ),
    ...[...shapes.values()].flatMap((shape) =>
      emitShape(shape, boundTo(shape)),
    ),
    ...connectors.flatMap(emitConnector),
    ...texts.map(emitFreeText),
  ])
}

function newId(): string {
  return randomBytes(15).toString("base64url")
}

function cleanText(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim()
}

/** A label that doesn't wrap. */
function labelOf(text: string, fontSize: number): Label | null {
  const original = cleanText(text)
  return original ? { text: original, original, fontSize } : null
}

// Excalidraw's getBoundTextMaxWidth / getBoundTextMaxHeight: the box inside a
// container that its label must fit.
function maxTextWidth(type: ShapeType, width: number): number {
  if (type === "ellipse")
    return Math.round((width / 2) * Math.SQRT2) - PADDING * 2
  if (type === "diamond") return Math.round(width / 2) - PADDING * 2
  return width - PADDING * 2
}

function maxTextHeight(type: ShapeType, height: number): number {
  return maxTextWidth(type, height)
}

// Excalidraw's computeContainerDimensionForBoundText: the container size
// whose text box is `dimension`.
function containerSize(type: ShapeType, dimension: number): number {
  const size = Math.ceil(dimension)
  if (type === "ellipse")
    return Math.round(((size + PADDING * 2) / Math.SQRT2) * 2)
  if (type === "diamond") return 2 * (size + PADDING * 2)
  return size + PADDING * 2
}

/**
 * A shape's box, grown where its label would not fit: missing sizes fit the
 * label, and a given height grows rather than let the label spill.
 */
function sizeShape(
  skeleton: ShapeSkeleton,
): Pick<Shape, "box" | "positioned" | "label"> {
  const { type } = skeleton
  const [minWidth, minHeight] = MIN_SIZE[type]
  const fontSize = skeleton.fontSize ?? FONT_SIZE
  const original = cleanText(skeleton.label ?? "")
  let label: Label | null = null
  let width = skeleton.width
  let height = skeleton.height
  if (original) {
    if (width === undefined) {
      const fit = measureText(
        wrapText(original, fontSize, AUTO_WRAP_WIDTH[type]),
        fontSize,
      )
      width = Math.max(
        minWidth,
        containerSize(type, fit.width + LABEL_MARGIN.x * 2),
      )
    }
    const text = wrapText(original, fontSize, maxTextWidth(type, width))
    label = { text, original, fontSize }
    const textHeight = measureText(text, fontSize).height
    height =
      height === undefined
        ? Math.max(
            minHeight,
            containerSize(type, textHeight + LABEL_MARGIN.y * 2),
          )
        : Math.max(height, containerSize(type, textHeight))
  }
  return {
    box: {
      x: skeleton.x ?? 0,
      y: skeleton.y ?? 0,
      width: width ?? minWidth,
      height: height ?? minHeight,
    },
    positioned: skeleton.x !== undefined && skeleton.y !== undefined,
    label,
  }
}

/**
 * Lays out the shapes with no position, and every cluster, as one graph
 * beside the hand-placed content, then stacks unplaced text above it all.
 */
function autoLayout(
  direction: SceneGraph["direction"],
  clustersByRef: Map<string, ClusterBox>,
  shapesByRef: Map<string, Shape>,
  connectors: Connector[],
  texts: FreeText[],
) {
  const clusters = [...clustersByRef.values()]
  const shapes = [...shapesByRef.values()]
  const placed = shapes.filter((shape) => shape.positioned)
  const floating = shapes.filter((shape) => !shape.positioned)
  const placedBounds = boundsOf([
    ...placed.map((shape) => shape.box),
    ...connectors.flatMap(({ skeleton }) =>
      [skeleton.start, skeleton.end].flatMap((point) =>
        point ? [{ x: point[0], y: point[1], width: 0, height: 0 }] : [],
      ),
    ),
    ...texts.flatMap((text) => (text.position ? [textBox(text)] : [])),
  ])

  if (floating.length > 0 || clusters.length > 0) {
    // Edges to a cluster can't be laid out; they are drawn straight.
    const floatingIds = new Set(floating.map((shape) => shape.id))
    const routed = connectors.filter(
      (connector): connector is Connector & { from: Shape; to: Shape } =>
        connector.from !== null &&
        connector.to !== null &&
        floatingIds.has(connector.from.id) &&
        floatingIds.has(connector.to.id),
    )
    const parentId = (item: Shape | ClusterBox) =>
      (item.parent && clustersByRef.get(item.parent)?.id) || null
    const layout = layoutGraph({
      direction,
      nodes: floating.map((shape) => ({
        id: shape.id,
        width: shape.box.width,
        height: shape.box.height,
        parent: parentId(shape),
      })),
      edges: routed.map(({ from, to, label }) => ({
        from: from.id,
        to: to.id,
        label: label ? measureText(label.text, label.fontSize) : undefined,
      })),
      clusters: clusters.map((cluster) => ({
        id: cluster.id,
        parent: parentId(cluster),
        titleHeight: cluster.title
          ? measureText(cluster.title.text, cluster.title.fontSize).height +
            PADDING * 2
          : 0,
      })),
    })
    const [left, top] = placedBounds
      ? [placedBounds.x + placedBounds.width + BLOCK_GAP, placedBounds.y]
      : [0, 0]
    const shift = (box: Box): Box => ({
      ...box,
      x: box.x + left,
      y: box.y + top,
    })
    for (const shape of floating) {
      const box = layout.nodes.get(shape.id)
      if (box) shape.box = shift(box)
    }
    for (const cluster of clusters) {
      const box = layout.clusters.get(cluster.id)
      if (box) cluster.box = shift(box)
    }
    routed.forEach((connector, index) => {
      connector.route = layout.edges[index].map(
        ([x, y]): Point => [x + left, y + top],
      )
    })
  }

  // Cluster titles don't wrap: the box widens to fit them instead.
  for (const { box, title } of clusters) {
    if (!title) continue
    const { width } = measureText(title.text, title.fontSize)
    box.width = Math.max(box.width, width + PADDING * 2 + 10)
  }

  const unplaced = texts.filter((text) => !text.position)
  const bounds = boundsOf([
    ...clusters.map((cluster) => cluster.box),
    ...shapes.map((shape) => shape.box),
    ...(placedBounds ? [placedBounds] : []),
  ])
  const heights = unplaced.map((text) => text.layout.height)
  const stackHeight = heights.reduce((sum, height) => sum + height + 20, 0)
  let y = bounds ? bounds.y - 40 - stackHeight : 0
  for (const [index, text] of unplaced.entries()) {
    text.position = [bounds?.x ?? 0, y]
    y += heights[index] + 20
  }
}

function boundsOf(boxes: Box[]): Box | null {
  return boxes.length > 0 ? boxes.reduce(union) : null
}

/** Free text wraps only past FREE_TEXT_MAX_WIDTH; then its width is fixed. */
function freeTextLayout(skeleton: TextSkeleton) {
  const fontSize = skeleton.fontSize ?? FONT_SIZE
  const original = cleanText(skeleton.text)
  const natural = measureText(original, fontSize)
  if (natural.width <= FREE_TEXT_MAX_WIDTH) {
    return { fontSize, original, text: original, ...natural, autoResize: true }
  }
  const text = wrapText(original, fontSize, FREE_TEXT_MAX_WIDTH)
  return {
    fontSize,
    original,
    text,
    width: FREE_TEXT_MAX_WIDTH,
    height: measureText(text, fontSize).height,
    autoResize: false,
  }
}

function textBox({ layout, position }: FreeText): Box {
  const [x, y] = position ?? [0, 0]
  return { x, y, width: layout.width, height: layout.height }
}

function base(id: string, type: string, box: Box, style: Style) {
  return {
    id,
    type,
    x: box.x,
    y: box.y,
    width: box.width,
    height: box.height,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: "solid",
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: 1,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null as { type: number } | null,
    seed: randomInt(1, 2 ** 31),
    version: 1,
    versionNonce: randomInt(1, 2 ** 31),
    isDeleted: false,
    boundElements: [] as { id: string; type: "arrow" | "text" }[],
    updated: Date.now(),
    link: null,
    locked: false,
  }
}

function textElement(options: {
  id: string
  box: Box
  text: string
  original: string
  fontSize: number
  strokeColor: string
  containerId: string | null
  textAlign: "left" | "center"
  verticalAlign: "top" | "middle"
  autoResize: boolean
}) {
  return {
    ...base(options.id, "text", options.box, {
      ...DEFAULT_STYLE,
      strokeColor: options.strokeColor,
    }),
    fontSize: options.fontSize,
    // Excalifont
    fontFamily: 5,
    text: options.text,
    originalText: options.original,
    textAlign: options.textAlign,
    verticalAlign: options.verticalAlign,
    containerId: options.containerId,
    autoResize: options.autoResize,
    lineHeight: LINE_HEIGHT,
  }
}

type BoundElement = { id: string; type: "arrow" | "text" }

function emitShape(shape: Shape, arrows: BoundElement[]) {
  const textId = shape.label ? newId() : null
  const element = {
    ...base(shape.id, shape.type, shape.box, shape.style),
    roundness:
      shape.type === "ellipse"
        ? null
        : { type: shape.type === "rectangle" ? 3 : 2 },
    boundElements: [
      ...(textId ? [{ id: textId, type: "text" as const }] : []),
      ...arrows,
    ],
  }
  if (!shape.label || !textId) return [element]
  return [element, boundText(shape, shape.label, textId)]
}

// Excalidraw's computeBoundTextPosition: centered in the container's text box.
function boundText(shape: Shape, label: Label, id: string) {
  const { type, box } = shape
  const size = measureText(label.text, label.fontSize)
  let insetX = PADDING
  let insetY = PADDING
  if (type === "ellipse") {
    insetX += (box.width / 2) * (1 - Math.SQRT2 / 2)
    insetY += (box.height / 2) * (1 - Math.SQRT2 / 2)
  } else if (type === "diamond") {
    insetX += box.width / 4
    insetY += box.height / 4
  }
  return textElement({
    id,
    box: {
      x: box.x + insetX + (maxTextWidth(type, box.width) - size.width) / 2,
      y: box.y + insetY + (maxTextHeight(type, box.height) - size.height) / 2,
      ...size,
    },
    text: label.text,
    original: label.original,
    fontSize: label.fontSize,
    strokeColor: shape.style.strokeColor,
    containerId: shape.id,
    textAlign: "center",
    verticalAlign: "middle",
    autoResize: true,
  })
}

/** A dashed gray box, its title bound top-left. */
function emitCluster(cluster: ClusterBox, arrows: BoundElement[]) {
  const { id, box, title } = cluster
  const textId = title ? newId() : null
  const element = {
    ...base(id, "rectangle", box, { ...DEFAULT_STYLE, ...CLUSTER_STYLE }),
    roundness: { type: 3 },
    boundElements: [
      ...(textId ? [{ id: textId, type: "text" as const }] : []),
      ...arrows,
    ],
  }
  if (!title || !textId) return [element]
  return [
    element,
    textElement({
      id: textId,
      box: {
        x: box.x + PADDING,
        y: box.y + PADDING,
        ...measureText(title.text, title.fontSize),
      },
      text: title.text,
      original: title.original,
      fontSize: title.fontSize,
      strokeColor: "#495057",
      containerId: id,
      textAlign: "left",
      verticalAlign: "top",
      autoResize: true,
    }),
  ]
}

function center({ box }: Target): Point {
  return [box.x + box.width / 2, box.y + box.height / 2]
}

/** Where a ray from the target's center toward `toward` leaves its outline, plus the binding gap. */
function outlinePoint(target: Target, toward: Point): Point {
  const [cx, cy] = center(target)
  let dx = toward[0] - cx
  const dy = toward[1] - cy
  if (dx === 0 && dy === 0) dx = 1
  const halfWidth = target.box.width / 2
  const halfHeight = target.box.height / 2
  const type = "type" in target ? target.type : "rectangle"
  const scale =
    type === "ellipse"
      ? 1 / Math.hypot(dx / halfWidth, dy / halfHeight)
      : type === "diamond"
        ? 1 / (Math.abs(dx) / halfWidth + Math.abs(dy) / halfHeight)
        : Math.min(halfWidth / Math.abs(dx), halfHeight / Math.abs(dy))
  const length = Math.hypot(dx, dy)
  return [
    cx + dx * scale + (dx / length) * BINDING_GAP,
    cy + dy * scale + (dy / length) * BINDING_GAP,
  ]
}

/** Drops route bends too slight to matter, so most edges come out straight. */
function simplify(points: Point[]): Point[] {
  const kept = [...points]
  for (let index = 1; index < kept.length - 1; ) {
    const [ax, ay] = kept[index - 1]
    const [px, py] = kept[index]
    const [bx, by] = kept[index + 1]
    const length = Math.hypot(bx - ax, by - ay)
    const offLine =
      length === 0
        ? Math.hypot(px - ax, py - ay)
        : Math.abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length
    if (offLine < 4) kept.splice(index, 1)
    else index++
  }
  return kept
}

function connectorPoints({ skeleton, from, to, route }: Connector): Point[] {
  // Validation guarantees a point wherever there is no shape.
  const anchor = (target: Target | null, point: number[] | undefined): Point =>
    target ? center(target) : [point?.[0] ?? 0, point?.[1] ?? 0]
  let points: Point[]
  if (route) {
    points = simplify(route)
  } else if (from && from === to) {
    // A loop off the top-right corner.
    const { x, y, width, height } = from.box
    points = [
      [x + width * 0.75, y],
      [x + width + 40, y - 40],
      [x + width, y + height * 0.25],
    ]
  } else {
    points = [anchor(from, skeleton.start), anchor(to, skeleton.end)]
  }
  if (from) points[0] = outlinePoint(from, points[1])
  if (to)
    points[points.length - 1] = outlinePoint(to, points[points.length - 2])
  return points
}

// Excalidraw puts an arrow's label on its middle point, or the middle of its
// middle segment.
function midpoint(points: Point[]): Point {
  if (points.length % 2 === 1) return points[Math.floor(points.length / 2)]
  const [ax, ay] = points[points.length / 2 - 1]
  const [bx, by] = points[points.length / 2]
  return [(ax + bx) / 2, (ay + by) / 2]
}

function emitConnector(connector: Connector) {
  const { skeleton, from, to } = connector
  const points = connectorPoints(connector)
  const [x0, y0] = points[0]
  const local = points.map(([x, y]): Point => [x - x0, y - y0])
  const xs = local.map(([x]) => x)
  const ys = local.map(([, y]) => y)
  const box = {
    x: x0,
    y: y0,
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  }
  const isLine = skeleton.type === "line"
  // A line attached to shapes is an arrow without heads: lines can't bind.
  const type = isLine && !from && !to ? "line" : "arrow"
  const label = type === "arrow" ? connector.label : null
  const labelId = label ? newId() : null
  const binding = (target: Target | null) =>
    target ? { elementId: target.id, focus: 0, gap: BINDING_GAP } : null

  const element = {
    ...base(connector.id, type, box, {
      ...DEFAULT_STYLE,
      strokeColor: skeleton.strokeColor ?? DEFAULT_STYLE.strokeColor,
      strokeStyle: skeleton.strokeStyle ?? DEFAULT_STYLE.strokeStyle,
      strokeWidth: skeleton.strokeWidth ?? DEFAULT_STYLE.strokeWidth,
    }),
    roundness: { type: 2 },
    boundElements: labelId ? [{ id: labelId, type: "text" as const }] : [],
    points: local,
    lastCommittedPoint: null,
    startBinding: type === "arrow" ? binding(from) : null,
    endBinding: type === "arrow" ? binding(to) : null,
    startArrowhead:
      skeleton.startArrowhead === undefined ? null : skeleton.startArrowhead,
    endArrowhead:
      skeleton.endArrowhead === undefined
        ? isLine
          ? null
          : "arrow"
        : skeleton.endArrowhead,
    ...(type === "arrow" ? { elbowed: false } : {}),
  }
  if (!label || !labelId) return [element]

  // Excalidraw's getBoundTextMaxWidth for arrows.
  const maxWidth = Math.max(box.width * 0.7, label.fontSize * 11)
  const text = wrapText(label.original, label.fontSize, maxWidth)
  const size = measureText(text, label.fontSize)
  const [mx, my] = midpoint(points)
  return [
    element,
    textElement({
      id: labelId,
      box: { x: mx - size.width / 2, y: my - size.height / 2, ...size },
      text,
      original: label.original,
      fontSize: label.fontSize,
      strokeColor: element.strokeColor,
      containerId: connector.id,
      textAlign: "center",
      verticalAlign: "middle",
      autoResize: true,
    }),
  ]
}

function emitFreeText(text: FreeText) {
  const { layout } = text
  return textElement({
    id: text.id,
    box: textBox(text),
    text: layout.text,
    original: layout.original,
    fontSize: layout.fontSize,
    strokeColor: text.skeleton.strokeColor ?? DEFAULT_STYLE.strokeColor,
    containerId: null,
    textAlign: "left",
    verticalAlign: "top",
    autoResize: layout.autoResize,
  })
}

const BASE_62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * Fractional indices in array order: "c" and three base-62 digits, an
 * integer key in Excalidraw's scheme. Not the fractional-indexing package:
 * the server bundle would load it from Excalidraw's chunk, and with it
 * Excalidraw, which needs a browser.
 */
function withIndices(elements: BuiltElement[]): BuiltElement[] {
  return elements.map((element, position) => {
    const digit = (place: number) =>
      BASE_62[Math.floor(position / 62 ** place) % 62]
    return { ...element, index: `c${digit(2)}${digit(1)}${digit(0)}` }
  })
}
