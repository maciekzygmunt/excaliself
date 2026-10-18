// Turns skeletons into the elements Excalidraw stores, without Excalidraw:
// its converter needs a DOM to measure text. Mirrors the editor's own rules
// for bound text (padding, max width, centering) and arrow bindings, so a
// built scene opens as if it had been drawn by hand.

import { randomBytes, randomInt } from "node:crypto"
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types"
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
  /** A cluster's box, titled top-left. */
  isCluster: boolean
  /** Ref of the cluster this sits in. */
  parent: string | null
}

type Connector = {
  id: string
  index: number
  skeleton: ConnectorSkeleton
  from: Shape | null
  to: Shape | null
  /** Set when the auto-layout routed it. */
  route: Point[] | null
}

type FreeText = {
  id: string
  skeleton: TextSkeleton
  position: Point | null
}

/** Builds a scene's elements. Throws SceneInputError listing every problem in the input. */
export function buildScene(graph: SceneGraph): ExcalidrawElement[] {
  // Checked first: layout time grows fast with the number of edges.
  const count = graph.elements.length + graph.clusters.length
  if (count > MAX_ELEMENTS) {
    throw new SceneInputError(
      `This scene has ${count} elements; the limit is ${MAX_ELEMENTS}.`,
    )
  }
  const errors: string[] = []
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
    shapes.set(cluster.id, {
      id: newId(),
      type: "rectangle",
      box: { x: 0, y: 0, width: 0, height: 0 },
      positioned: false,
      label: cluster.label ? labelOf(cluster.label, CLUSTER_FONT_SIZE) : null,
      style: { ...DEFAULT_STYLE, ...CLUSTER_STYLE },
      isCluster: true,
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
          isCluster: false,
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
      const shape = shapes.get(ref)
      if (!shape) {
        errors.push(
          refs.has(ref)
            ? `${where}.${field}: "${ref}" is not a shape.`
            : `${where}.${field}: no shape has id "${ref}".`,
        )
      }
      return shape ?? null
    }
    connector.from = resolve(from, "from")
    connector.to = resolve(to, "to")
    if (from === undefined && start === undefined)
      errors.push(`${where}: give "from" (a shape id) or "start" (a point).`)
    if (to === undefined && end === undefined)
      errors.push(`${where}: give "to" (a shape id) or "end" (a point).`)
  }

  if (errors.length > 0) throw new SceneInputError(errors.join("\n"))

  autoLayout(graph.direction, shapes, connectors, texts)

  return withIndices([
    ...emitShapes(shapes, connectors),
    ...connectors.flatMap(emitConnector),
    ...texts.flatMap(emitFreeText),
  ])
}

function newId(): string {
  return randomBytes(15).toString("base64url")
}

function labelOf(text: string, fontSize: number): Label | null {
  const original = text.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim()
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
  const label = skeleton.label ? labelOf(skeleton.label, fontSize) : null
  let width = skeleton.width
  let height = skeleton.height
  if (label) {
    if (width === undefined) {
      const fit = measureText(
        wrapText(label.original, fontSize, AUTO_WRAP_WIDTH[type]),
        fontSize,
      )
      width = Math.max(
        minWidth,
        containerSize(type, fit.width + LABEL_MARGIN.x * 2),
      )
    }
    label.text = wrapText(label.original, fontSize, maxTextWidth(type, width))
    const textHeight = measureText(label.text, fontSize).height
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
 * Lays out the shapes with no position (and every cluster) as one graph,
 * beside the hand-placed content, then stacks unplaced text above it all.
 */
function autoLayout(
  direction: SceneGraph["direction"],
  shapesByRef: Map<string, Shape>,
  connectors: Connector[],
  texts: FreeText[],
) {
  const shapes = [...shapesByRef.values()]
  const placed = shapes.filter((shape) => shape.positioned)
  const floating = new Set(shapes.filter((shape) => !shape.positioned))
  const placedBounds = boundsOf([
    ...placed.map((shape) => shape.box),
    ...connectors.flatMap(({ skeleton }) =>
      [skeleton.start, skeleton.end].flatMap((point) =>
        point ? [{ x: point[0], y: point[1], width: 0, height: 0 }] : [],
      ),
    ),
    ...texts.flatMap((text) => (text.position ? [textBox(text)] : [])),
  ])

  if (floating.size > 0) {
    // Edges to a cluster can't be laid out; they are drawn straight.
    const routed = connectors.filter(
      (connector): connector is Connector & { from: Shape; to: Shape } =>
        connector.from !== null &&
        connector.to !== null &&
        floating.has(connector.from) &&
        floating.has(connector.to) &&
        !connector.from.isCluster &&
        !connector.to.isCluster,
    )
    const parentId = (shape: Shape) =>
      (shape.parent && shapesByRef.get(shape.parent)?.id) || null
    const layout = layoutGraph({
      direction,
      nodes: [...floating]
        .filter((shape) => !shape.isCluster)
        .map((shape) => ({
          id: shape.id,
          width: shape.box.width,
          height: shape.box.height,
          parent: parentId(shape),
        })),
      edges: routed.map(({ from, to, skeleton }) => {
        const label = connectorLabel(skeleton)
        return {
          from: from.id,
          to: to.id,
          label: label ? measureText(label.text, label.fontSize) : undefined,
        }
      }),
      clusters: [...floating]
        .filter((shape) => shape.isCluster)
        .map((shape) => ({
          id: shape.id,
          parent: parentId(shape),
          titleHeight: shape.label
            ? measureText(shape.label.text, shape.label.fontSize).height +
              PADDING * 2
            : 0,
        })),
    })
    const [left, top] = placedBounds
      ? [placedBounds.x + placedBounds.width + BLOCK_GAP, placedBounds.y]
      : [0, 0]
    for (const shape of floating) {
      const box = (shape.isCluster ? layout.clusters : layout.nodes).get(
        shape.id,
      )
      if (box) shape.box = { ...box, x: box.x + left, y: box.y + top }
    }
    routed.forEach((connector, index) => {
      connector.route = layout.edges[index].map(
        ([x, y]): Point => [x + left, y + top],
      )
    })
  }

  // Cluster titles don't wrap: the box widens to fit them instead.
  for (const shape of shapes) {
    if (!shape.isCluster || !shape.label) continue
    const { width } = measureText(shape.label.text, shape.label.fontSize)
    shape.box.width = Math.max(shape.box.width, width + PADDING * 2 + 10)
  }

  const unplaced = texts.filter((text) => !text.position)
  const bounds = boundsOf([
    ...shapes.map((shape) => shape.box),
    ...(placedBounds ? [placedBounds] : []),
  ])
  const heights = unplaced.map((text) => textBox(text).height)
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
  const original = labelOf(skeleton.text, fontSize)?.original ?? ""
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

function textBox(text: FreeText): Box {
  const { width, height } = freeTextLayout(text.skeleton)
  const [x, y] = text.position ?? [0, 0]
  return { x, y, width, height }
}

function connectorLabel(skeleton: ConnectorSkeleton): Label | null {
  return skeleton.label
    ? labelOf(skeleton.label, skeleton.fontSize ?? FONT_SIZE)
    : null
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

/** Clusters outermost first, so they sit behind what they hold. */
function emitShapes(shapesByRef: Map<string, Shape>, connectors: Connector[]) {
  const depth = (shape: Shape | undefined): number =>
    shape?.isCluster ? 1 + depth(shapesByRef.get(shape.parent ?? "")) : 0
  return [...shapesByRef.values()]
    .sort(
      (a, b) =>
        (a.isCluster ? depth(a) : Number.MAX_SAFE_INTEGER) -
        (b.isCluster ? depth(b) : Number.MAX_SAFE_INTEGER),
    )
    .flatMap((shape) => {
      const textId = shape.label ? newId() : null
      const arrows = connectors.filter(
        ({ from, to }) => from === shape || to === shape,
      )
      const element = {
        ...base(shape.id, shape.type, shape.box, shape.style),
        roundness:
          shape.type === "ellipse"
            ? null
            : { type: shape.type === "rectangle" ? 3 : 2 },
        boundElements: [
          ...(textId ? [{ id: textId, type: "text" as const }] : []),
          ...arrows.map(({ id }) => ({ id, type: "arrow" as const })),
        ],
      }
      if (!shape.label || !textId) return [element]
      return [element, boundText(shape, shape.label, textId)]
    })
}

// Excalidraw's computeBoundTextPosition: centered in the container's text
// box, or top-left for a cluster title.
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
  const title = shape.isCluster
  const x = title
    ? box.x + insetX
    : box.x + insetX + (maxTextWidth(type, box.width) - size.width) / 2
  const y = title
    ? box.y + insetY
    : box.y + insetY + (maxTextHeight(type, box.height) - size.height) / 2
  return textElement({
    id,
    box: { x, y, ...size },
    text: label.text,
    original: label.original,
    fontSize: label.fontSize,
    strokeColor: title ? "#495057" : shape.style.strokeColor,
    containerId: shape.id,
    textAlign: title ? "left" : "center",
    verticalAlign: title ? "top" : "middle",
    autoResize: true,
  })
}

function center({ box }: Shape): Point {
  return [box.x + box.width / 2, box.y + box.height / 2]
}

/** Where a ray from the shape's center toward `toward` leaves its outline, plus the binding gap. */
function outlinePoint(shape: Shape, toward: Point): Point {
  const [cx, cy] = center(shape)
  let dx = toward[0] - cx
  const dy = toward[1] - cy
  if (dx === 0 && dy === 0) dx = 1
  const halfWidth = shape.box.width / 2
  const halfHeight = shape.box.height / 2
  const scale =
    shape.type === "ellipse"
      ? 1 / Math.hypot(dx / halfWidth, dy / halfHeight)
      : shape.type === "diamond"
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
  const anchor = (shape: Shape | null, point: number[] | undefined): Point =>
    shape ? center(shape) : [point?.[0] ?? 0, point?.[1] ?? 0]
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
  const label = type === "arrow" ? connectorLabel(skeleton) : null
  const labelId = label ? newId() : null
  const binding = (shape: Shape | null) =>
    shape ? { elementId: shape.id, focus: 0, gap: BINDING_GAP } : null

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
  const layout = freeTextLayout(text.skeleton)
  const [x, y] = text.position ?? [0, 0]
  return [
    textElement({
      id: text.id,
      box: { x, y, width: layout.width, height: layout.height },
      text: layout.text,
      original: layout.original,
      fontSize: layout.fontSize,
      strokeColor: text.skeleton.strokeColor ?? DEFAULT_STYLE.strokeColor,
      containerId: null,
      textAlign: "left",
      verticalAlign: "top",
      autoResize: layout.autoResize,
    }),
  ]
}

const BASE_62 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

/**
 * Fractional indices in array order: "c" and three base-62 digits, an
 * integer key in Excalidraw's scheme. Not the fractional-indexing package:
 * the server bundle would load it from Excalidraw's chunk, and with it
 * Excalidraw, which needs a browser.
 */
function withIndices(elements: object[]): ExcalidrawElement[] {
  return elements.map((element, position) => {
    const digit = (place: number) =>
      BASE_62[Math.floor(position / 62 ** place) % 62]
    return {
      ...element,
      index: `c${digit(2)}${digit(1)}${digit(0)}`,
    } as unknown as ExcalidrawElement
  })
}
