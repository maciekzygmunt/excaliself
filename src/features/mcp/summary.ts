// read_drawing's view of a scene: what an LLM needs to understand a drawing
// (shapes and their labels, text, what connects to what, what sits inside
// what) in a few lines, instead of the raw element JSON.

type Element = Record<string, unknown>
type Box = { x: number; y: number; width: number; height: number }

const SHAPE_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "image",
  "frame",
  "magicframe",
  "embeddable",
  "iframe",
])
// An unattached arrow end this close to a shape is read as pointing at it.
const NEAR = 20
const MAX_ITEMS = 200
const MAX_TEXT = 300

const num = (value: unknown) => (typeof value === "number" ? value : 0)
const str = (value: unknown) => (typeof value === "string" ? value : "")

function boxOf(element: Element): Box {
  return {
    x: num(element.x),
    y: num(element.y),
    width: Math.abs(num(element.width)),
    height: Math.abs(num(element.height)),
  }
}

const contains = (outer: Box, inner: Box, margin = 0) =>
  inner.x >= outer.x - margin &&
  inner.y >= outer.y - margin &&
  inner.x + inner.width <= outer.x + outer.width + margin &&
  inner.y + inner.height <= outer.y + outer.height + margin

const quote = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return JSON.stringify(
    flat.length > MAX_TEXT ? `${flat.slice(0, MAX_TEXT)}…` : flat,
  )
}

const at = ({ x, y }: { x: number; y: number }) =>
  `(${Math.round(x)}, ${Math.round(y)})`

function capped(lines: string[]): string[] {
  return lines.length > MAX_ITEMS
    ? [...lines.slice(0, MAX_ITEMS), `… and ${lines.length - MAX_ITEMS} more`]
    : lines
}

const area = (element: Element) => {
  const { width, height } = boxOf(element)
  return width * height
}

function smallest(elements: Element[]): Element | undefined {
  return elements.reduce<Element | undefined>(
    (best, element) => (!best || area(element) < area(best) ? element : best),
    undefined,
  )
}

export function summarizeScene(elements: readonly Element[]): string {
  const live = elements.filter((element) => !element.isDeleted)
  if (live.length === 0) return "The drawing is empty."
  const byId = new Map(live.map((element) => [str(element.id), element]))

  const labels = new Map<string, string>()
  const freeTexts: Element[] = []
  for (const element of live) {
    if (element.type !== "text") continue
    const text = str(element.originalText) || str(element.text)
    const containerId = str(element.containerId)
    if (containerId && byId.has(containerId)) labels.set(containerId, text)
    else freeTexts.push(element)
  }

  const readingOrder = (a: Element, b: Element) =>
    num(a.y) - num(b.y) || num(a.x) - num(b.x)
  const shapes = live
    .filter((element) => SHAPE_TYPES.has(str(element.type)))
    .sort(readingOrder)
  const refs = new Map(
    shapes.map((shape, index) => [str(shape.id), `S${index + 1}`]),
  )
  const name = (shape: Element) => {
    const id = str(shape.id)
    const label = labels.get(id) ?? str(shape.name)
    return label ? `${refs.get(id)} ${quote(label)}` : `${refs.get(id)}`
  }

  // The smallest other shape fully around a box, if any.
  const enclosing = (box: Box, self: Element) =>
    smallest(
      shapes.filter(
        (shape) =>
          shape !== self &&
          shape.type !== "image" &&
          contains(boxOf(shape), box) &&
          !contains(box, boxOf(shape)),
      ),
    )
  const placement = (element: Element) => {
    const frame = byId.get(str(element.frameId))
    if (frame) return `, in frame ${name(frame)}`
    const outer = enclosing(boxOf(element), element)
    return outer ? `, inside ${refs.get(str(outer.id))}` : ""
  }

  const shapeLines = shapes.map((shape) => {
    const { x, y, width, height } = boxOf(shape)
    const details = [
      `${name(shape)}: ${shape.type} at ${at({ x, y })}, ${Math.round(width)}×${Math.round(height)}`,
    ]
    const fill = str(shape.backgroundColor)
    if (fill && fill !== "transparent") details.push(`, fill ${fill}`)
    if (shape.strokeStyle && shape.strokeStyle !== "solid")
      details.push(`, ${shape.strokeStyle}`)
    return details.join("") + placement(shape)
  })

  // An end attached by binding, else read off what it lies on or near.
  const endOf = (connector: Element, which: "start" | "end") => {
    const binding = connector[`${which}Binding`] as {
      elementId?: unknown
    } | null
    const bound = byId.get(str(binding?.elementId))
    if (bound && refs.has(str(bound.id))) return name(bound)
    if (bound?.type === "text")
      return `text ${quote(str(bound.originalText) || str(bound.text))}`
    const points = Array.isArray(connector.points)
      ? (connector.points as [number, number][])
      : []
    const local = which === "start" ? points[0] : points[points.length - 1]
    const point = {
      x: num(connector.x) + num(local?.[0]),
      y: num(connector.y) + num(local?.[1]),
    }
    const near = smallest(
      shapes.filter((shape) =>
        contains(boxOf(shape), { ...point, width: 0, height: 0 }, NEAR),
      ),
    )
    return near ? `${name(near)} (not attached)` : at(point)
  }
  const connectors = live.filter(
    (element) => element.type === "arrow" || element.type === "line",
  )
  const connectorLines = connectors.map((connector) => {
    const start = endOf(connector, "start")
    const end = endOf(connector, "end")
    const heads = [connector.startArrowhead, connector.endArrowhead]
    const kind = connector.type === "line" ? "line" : "arrow"
    const line =
      heads[1] && !heads[0]
        ? `${start} → ${end}`
        : heads[0] && !heads[1]
          ? `${end} → ${start}`
          : heads[0] && heads[1]
            ? `${start} ↔ ${end}`
            : `${start} — ${end} (${kind}, no arrowheads)`
    const label = labels.get(str(connector.id))
    const style =
      connector.strokeStyle && connector.strokeStyle !== "solid"
        ? `, ${connector.strokeStyle}`
        : ""
    return `${line}${label ? `, labeled ${quote(label)}` : ""}${style}`
  })

  const textLines = freeTexts
    .sort(readingOrder)
    .map(
      (text) =>
        `${quote(str(text.originalText) || str(text.text))} at ${at(boxOf(text))}${placement(text)}`,
    )

  const freedraws = live.filter((element) => element.type === "freedraw").length
  const sections = [
    `${live.length} elements. Positions are canvas pixels (x right, y down); S1, S2, … name shapes in reading order.`,
  ]
  const section = (title: string, lines: string[]) => {
    if (lines.length > 0)
      sections.push(`${title}:\n${capped(lines).join("\n")}`)
  }
  section("Shapes", shapeLines)
  section("Connections", connectorLines)
  section("Text", textLines)
  if (freedraws > 0)
    sections.push(
      `Also ${freedraws} freehand stroke${freedraws === 1 ? "" : "s"}.`,
    )
  return sections.join("\n\n")
}
