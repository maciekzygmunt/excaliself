import { expect, test } from "vitest"
import { buildScene } from "./build"
import { parseMermaid } from "./mermaid"
import {
  type Cluster,
  type ElementSkeleton,
  type SceneGraph,
  SceneInputError,
} from "./skeleton"

type Built = Record<string, unknown> & {
  id: string
  type: string
  x: number
  y: number
  width: number
  height: number
}
type Point = [number, number]

function build(
  elements: ElementSkeleton[],
  options: Partial<SceneGraph> = {},
): Built[] {
  return buildScene({
    elements,
    clusters: [],
    direction: "TB",
    ...options,
  }) as unknown as Built[]
}

const labelOf = (elements: Built[], container: Built) =>
  elements.find((element) => element.containerId === container.id) as Built

const corners = ({ x, y, width, height }: Built): Point[] => [
  [x, y],
  [x + width, y],
  [x, y + height],
  [x + width, y + height],
]

// How far outside the shape's outline a point is: <= 1 is on or inside it.
function outlineRatio(shape: Built, [px, py]: Point): number {
  const dx = Math.abs(px - (shape.x + shape.width / 2)) / (shape.width / 2)
  const dy = Math.abs(py - (shape.y + shape.height / 2)) / (shape.height / 2)
  if (shape.type === "ellipse") return Math.hypot(dx, dy)
  if (shape.type === "diamond") return dx + dy
  return Math.max(dx, dy)
}

function endpoints(arrow: Built): [Point, Point] {
  const points = arrow.points as Point[]
  const [lastX, lastY] = points[points.length - 1]
  return [
    [arrow.x + points[0][0], arrow.y + points[0][1]],
    [arrow.x + lastX, arrow.y + lastY],
  ]
}

const overlaps = (a: Built, b: Built) =>
  a.x < b.x + b.width &&
  b.x < a.x + a.width &&
  a.y < b.y + b.height &&
  b.y < a.y + a.height

const LONG_LABEL =
  "A fairly long label that has to wrap over several lines to fit"

test("labels wrap to fit inside their shapes, centered", () => {
  const elements = build([
    { type: "rectangle", id: "rectangle", x: 0, y: 0, label: LONG_LABEL },
    { type: "ellipse", id: "ellipse", x: 400, y: 0, label: LONG_LABEL },
    { type: "diamond", id: "diamond", x: 800, y: 0, label: LONG_LABEL },
    {
      type: "rectangle",
      id: "narrow",
      x: 0,
      y: 400,
      width: 100,
      height: 40,
      label: LONG_LABEL,
    },
  ])

  const containers = elements.filter((element) => element.type !== "text")
  expect(containers).toHaveLength(4)
  for (const container of containers) {
    const label = labelOf(elements, container)
    expect(label.text).toContain("\n")
    expect((label.text as string).replace(/\n/g, " ")).toBe(LONG_LABEL)
    expect(label.originalText).toBe(LONG_LABEL)
    for (const corner of corners(label)) {
      expect(outlineRatio(container, corner)).toBeLessThanOrEqual(1)
    }
    // Excalidraw rounds the text box of ellipses and diamonds.
    expect(label.x + label.width / 2).toBeCloseTo(
      container.x + container.width / 2,
      0,
    )
    expect(label.y + label.height / 2).toBeCloseTo(
      container.y + container.height / 2,
      0,
    )
  }
  // A given height grows rather than let the label spill.
  const narrow = containers[3]
  expect(narrow.width).toBe(100)
  expect(narrow.height).toBeGreaterThan(40)
})

test("an arrow attaches to both shapes and stops at their outlines", () => {
  const elements = build([
    { type: "rectangle", id: "api", x: 0, y: 0, label: "API" },
    { type: "ellipse", id: "db", x: 400, y: 250, label: "Postgres" },
    { type: "arrow", from: "api", to: "db", label: "SQL" },
  ])
  const [api, , db, , arrow, label] = elements

  expect(arrow.type).toBe("arrow")
  expect(arrow.startBinding).toMatchObject({ elementId: api.id })
  expect(arrow.endBinding).toMatchObject({ elementId: db.id })
  expect(api.boundElements).toContainEqual({ id: arrow.id, type: "arrow" })
  expect(db.boundElements).toContainEqual({ id: arrow.id, type: "arrow" })

  const [start, end] = endpoints(arrow)
  for (const [shape, point] of [
    [api, start],
    [db, end],
  ] as const) {
    expect(outlineRatio(shape, point)).toBeGreaterThan(1)
    // 10px toward the shape's center is inside it: the gap is small.
    const [cx, cy] = [shape.x + shape.width / 2, shape.y + shape.height / 2]
    const length = Math.hypot(cx - point[0], cy - point[1])
    const inward: Point = [
      point[0] + ((cx - point[0]) / length) * 10,
      point[1] + ((cy - point[1]) / length) * 10,
    ]
    expect(outlineRatio(shape, inward)).toBeLessThan(1)
  }

  expect(label.containerId).toBe(arrow.id)
  expect(arrow.boundElements).toEqual([{ id: label.id, type: "text" }])
  expect(label.x + label.width / 2).toBeCloseTo((start[0] + end[0]) / 2)
  expect(label.y + label.height / 2).toBeCloseTo((start[1] + end[1]) / 2)
})

test("a line between shapes is a headless arrow; a free line is a line", () => {
  const elements = build([
    { type: "rectangle", id: "a", x: 0, y: 0 },
    { type: "rectangle", id: "b", x: 300, y: 0 },
    { type: "line", from: "a", to: "b" },
    { type: "line", start: [0, 200], end: [300, 200] },
  ])
  const [attached, free] = elements.slice(2)

  expect(attached).toMatchObject({
    type: "arrow",
    startArrowhead: null,
    endArrowhead: null,
  })
  expect(attached.startBinding).not.toBeNull()
  expect(free).toMatchObject({ type: "line", x: 0, y: 200, width: 300 })
  expect(free.points).toEqual([
    [0, 0],
    [300, 0],
  ])
})

test("Excalidraw restores a built scene without dropping or detaching anything", async () => {
  // Excalidraw reads a 2d context at import time; jsdom has none.
  HTMLCanvasElement.prototype.getContext = (() => ({
    measureText: () => ({ width: 0 }),
  })) as never
  const { restoreElements } = await import("@excalidraw/excalidraw")
  const elements = build(
    [
      { type: "rectangle", id: "web", label: "Web" },
      { type: "diamond", id: "cache", label: "Cached?" },
      { type: "ellipse", id: "db", label: "Postgres" },
      { type: "arrow", from: "web", to: "cache" },
      { type: "arrow", from: "cache", to: "db", label: "miss" },
      { type: "arrow", from: "cache", to: "web", strokeStyle: "dashed" },
      { type: "text", text: "Read path" },
      { type: "line", start: [0, 0], end: [100, 50] },
    ],
    {
      clusters: [
        { id: "backend", label: "Backend", parent: null, members: ["db"] },
      ],
    },
  )

  const restored = restoreElements(elements as never, null, {
    repairBindings: true,
  })

  expect(restored).toEqual(elements)
})

test("shapes without a position are laid out beside the placed ones, in the flow's direction", () => {
  const elements = build(
    [
      { type: "rectangle", id: "placed", x: 0, y: 0, width: 200, height: 300 },
      { type: "rectangle", id: "a", label: "Client" },
      { type: "rectangle", id: "b", label: "Gateway" },
      { type: "rectangle", id: "c", label: "Orders service" },
      { type: "rectangle", id: "d", label: "Billing service" },
      { type: "arrow", from: "a", to: "b" },
      { type: "arrow", from: "b", to: "c" },
      { type: "arrow", from: "b", to: "d" },
    ],
    { direction: "LR" },
  )
  const [placed, a, b, c, d] = elements.filter(
    (element) => element.type === "rectangle",
  )

  expect(placed).toMatchObject({ x: 0, y: 0, width: 200, height: 300 })
  const laidOut = [a, b, c, d]
  for (const shape of laidOut) {
    expect(shape.x).toBeGreaterThan(placed.x + placed.width)
  }
  for (const [index, shape] of laidOut.entries()) {
    for (const other of laidOut.slice(index + 1)) {
      expect(overlaps(shape, other)).toBe(false)
    }
  }
  expect(a.x + a.width).toBeLessThan(b.x)
  expect(b.x + b.width).toBeLessThan(Math.min(c.x, d.x))
})

test("a cluster's box holds its members, with its title above them", () => {
  const clusters: Cluster[] = [
    { id: "aws", label: "AWS", parent: null, members: ["lb"] },
    { id: "vpc", label: "Private VPC", parent: "aws", members: ["app", "db"] },
  ]
  const elements = build(
    [
      { type: "rectangle", id: "user", label: "User" },
      { type: "rectangle", id: "lb", label: "Load balancer" },
      { type: "rectangle", id: "app", label: "App" },
      { type: "ellipse", id: "db", label: "Database" },
      { type: "arrow", from: "user", to: "lb" },
      { type: "arrow", from: "lb", to: "app" },
      { type: "arrow", from: "app", to: "db" },
    ],
    { clusters },
  )
  const byLabel = (text: string) => {
    const label = elements.find((element) => element.text === text) as Built
    return elements.find((element) => element.id === label.containerId) as Built
  }
  const contains = (outer: Built, inner: Built) =>
    corners(inner).every(([x, y]) => outlineRatio(outer, [x, y]) <= 1)

  const aws = byLabel("AWS")
  const vpc = byLabel("Private VPC")
  expect(contains(aws, vpc)).toBe(true)
  expect(contains(aws, byLabel("Load balancer"))).toBe(true)
  expect(contains(vpc, byLabel("App"))).toBe(true)
  expect(contains(vpc, byLabel("Database"))).toBe(true)
  expect(contains(aws, byLabel("User"))).toBe(false)

  // Outer boxes come first, so they draw behind what they hold.
  const order = (shape: Built) => elements.indexOf(shape)
  expect(order(aws)).toBeLessThan(order(vpc))
  expect(order(vpc)).toBeLessThan(order(byLabel("App")))

  const title = labelOf(elements, vpc)
  expect(title).toMatchObject({ textAlign: "left", verticalAlign: "top" })
  for (const member of [byLabel("App"), byLabel("Database")]) {
    expect(title.y + title.height).toBeLessThanOrEqual(member.y)
  }
})

test.each(["LR", "TB"] as const)(
  "boxes either nest or keep apart, cluster titles included (%s)",
  (direction) => {
    // An architecture diagram an MCP client sent, with nested subgraphs.
    const elements = buildScene({
      ...parseMermaid(`flowchart LR
      subgraph browser["Browser"]
        spa["React app: TanStack Router + Query, Excalidraw canvas"]
        room_client["Room client: socket, heartbeat, reconnect"]
      end
      subgraph ai["Member's AI client"]
        mcp_client["MCP client, e.g. Claude"]
      end
      subgraph docker["Docker host"]
        subgraph node["excaliself container"]
          ssr["TanStack Start: SSR + server functions"]
          api["HTTP routes"]
          ws["WebSocket route: Room registry"]
          mcp["MCP endpoint /api/mcp"]
        end
        subgraph pg["db container: Postgres 17"]
          db[("Drizzle schema")]
        end
      end
      spa -->|"pages, server fns"| ssr
      spa --> api
      room_client <-->|"scene sync"| ws
      mcp_client -->|"Bearer token"| mcp
      ssr --> db
      ws -->|"flush scene"| db
      mcp --> db`),
      direction,
    }) as unknown as Built[]
    const boxes = elements.filter(
      (element) => element.type !== "text" && element.type !== "arrow",
    )
    const contains = (outer: Built, inner: Built) =>
      corners(inner).every(([x, y]) => outlineRatio(outer, [x, y]) <= 1)

    for (const [index, a] of boxes.entries()) {
      for (const b of boxes.slice(index + 1)) {
        if (contains(a, b) || contains(b, a)) continue
        expect(
          overlaps(a, b),
          `${labelOf(elements, a)?.text} / ${labelOf(elements, b)?.text}`,
        ).toBe(false)
      }
    }
  },
)

test("repeated and looping edges lay out, each still drawn", () => {
  const elements = buildScene(
    parseMermaid(`flowchart TD\n${"A-->C\nA-->B\nB-->C\nB-->B\n".repeat(3)}`),
  ) as unknown as Built[]

  expect(elements.filter((element) => element.type === "arrow")).toHaveLength(
    12,
  )
})

test("a shape without an id never replaces one with an id", () => {
  const elements = build([
    { type: "rectangle", id: "#1", x: 0, y: 0 },
    { type: "rectangle", x: 200, y: 0 },
  ])

  expect(elements).toHaveLength(2)
})

test("a scene past the element limit is refused before any work", () => {
  // `a & b & … --> c & d & …` makes one arrow per pair.
  const group = (prefix: string) =>
    Array.from({ length: 40 }, (_, index) => `${prefix}${index}`).join(" & ")
  const graph = parseMermaid(`flowchart LR\n${group("a")} --> ${group("b")}`)

  expect(() => buildScene(graph)).toThrow(
    "This scene has 1680 elements; the limit is 500.",
  )
})

test("every problem in the input is reported at once", () => {
  const attempt = () =>
    build([
      { type: "rectangle", id: "a" },
      { type: "rectangle", id: "a" },
      { type: "ellipse", x: 10 },
      { type: "text", id: "note", text: "Note" },
      { type: "arrow", from: "a", to: "missing" },
      { type: "arrow", from: "note", end: [0, 0] },
      { type: "arrow", from: "a" },
    ])

  expect(attempt).toThrow(SceneInputError)
  expect(attempt).toThrow(
    [
      'elements[1]: id "a" is used twice.',
      "elements[2]: give both x and y, or neither.",
      'elements[4].to: no shape has id "missing".',
      'elements[5].from: "note" is not a shape.',
      'elements[6]: give "to" (a shape id) or "end" (a point).',
    ].join("\n"),
  )
})
