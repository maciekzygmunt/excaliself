// Auto-layout for shapes that came without a position: a layered graph
// layout (dagre), the same kind Mermaid uses for flowcharts.

import dagre from "@dagrejs/dagre"
import { type Direction, SceneInputError } from "./skeleton"

export type Point = [number, number]
export type Box = { x: number; y: number; width: number; height: number }

export type LayoutInput = {
  direction: Direction
  nodes: { id: string; width: number; height: number; parent: string | null }[]
  /** `label` reserves room for the edge's label. */
  edges: {
    from: string
    to: string
    label?: { width: number; height: number }
  }[]
  /** `titleHeight` is kept free above the cluster's members. */
  clusters: { id: string; parent: string | null; titleHeight: number }[]
}

export type LayoutResult = {
  /** Top-left corners, with the whole layout's top-left at 0,0. */
  nodes: Map<string, Box>
  clusters: Map<string, Box>
  /** Per edge, in input order: the route from source to target. */
  edges: Point[][]
}

const CLUSTER_PADDING = 20
const EMPTY_CLUSTER = { width: 160, height: 60 }

export function layoutGraph(input: LayoutInput): LayoutResult {
  const graph = new dagre.graphlib.Graph({ compound: true, multigraph: true })
  // Cluster titles grow boxes past dagre's spacing; leave room for them.
  const titleRoom = Math.max(0, ...input.clusters.map((c) => c.titleHeight))
  graph.setGraph({
    rankdir: input.direction,
    nodesep: 60 + titleRoom,
    ranksep: 80 + titleRoom,
    edgesep: 20,
  })
  graph.setDefaultEdgeLabel(() => ({}))
  const parents = new Set(
    [...input.clusters, ...input.nodes].map((item) => item.parent),
  )
  for (const cluster of input.clusters) {
    // dagre sizes a cluster from its children; an empty one is a plain node.
    graph.setNode(
      cluster.id,
      parents.has(cluster.id)
        ? {
            paddingTop: CLUSTER_PADDING,
            paddingBottom: CLUSTER_PADDING,
            paddingLeft: CLUSTER_PADDING,
            paddingRight: CLUSTER_PADDING,
          }
        : { width: EMPTY_CLUSTER.width, height: EMPTY_CLUSTER.height },
    )
  }
  for (const node of input.nodes) {
    graph.setNode(node.id, { width: node.width, height: node.height })
  }
  for (const item of [...input.clusters, ...input.nodes]) {
    if (item.parent) graph.setParent(item.id, item.parent)
  }
  // One dagre edge per pair: dagre can fail on repeated edges, and the
  // repeats share the first one's route.
  const pairName = new Map<string, string>()
  const edgeNames = input.edges.map((edge, index) => {
    const pair = `${edge.from}\0${edge.to}`
    const existing = pairName.get(pair)
    if (existing) return existing
    pairName.set(pair, `e${index}`)
    graph.setEdge(
      edge.from,
      edge.to,
      {
        width: edge.label?.width ?? 0,
        height: edge.label?.height ?? 0,
        labelpos: "c",
      },
      `e${index}`,
    )
    return `e${index}`
  })

  try {
    dagre.layout(graph)
  } catch {
    throw new SceneInputError(
      "The automatic layout failed for this graph. Give the shapes x and y, or simplify the graph.",
    )
  }

  const centered = (id: string): Box => {
    const { x, y, width, height } = graph.node(id)
    return { x: x - width / 2, y: y - height / 2, width, height }
  }
  const nodes = new Map(input.nodes.map((node) => [node.id, centered(node.id)]))
  const clusters = clusterBoxes(input, centered, nodes)
  const edges: Point[][] = input.edges.map((edge, index) =>
    graph
      .edge({ v: edge.from, w: edge.to, name: edgeNames[index] })
      .points.map(({ x, y }: { x: number; y: number }): Point => [x, y]),
  )

  // Shift everything so the layout starts at 0,0.
  const all = [...nodes.values(), ...clusters.values()]
  const left = Math.min(...all.map((box) => box.x))
  const top = Math.min(...all.map((box) => box.y))
  const shift = (box: Box) => ({ ...box, x: box.x - left, y: box.y - top })
  return {
    nodes: new Map([...nodes].map(([id, box]) => [id, shift(box)])),
    clusters: new Map([...clusters].map(([id, box]) => [id, shift(box)])),
    edges: edges.map((points) =>
      points.map(([x, y]): Point => [x - left, y - top]),
    ),
  }
}

/**
 * A cluster's box holds its members, and its title in the room dagre leaves
 * above them; the box grows upward only where that room is too small, and
 * outward to hold child clusters that grew.
 */
function clusterBoxes(
  input: LayoutInput,
  layoutBox: (id: string) => Box,
  nodes: Map<string, Box>,
): Map<string, Box> {
  const depth = (id: string | null): number => {
    const cluster = input.clusters.find((candidate) => candidate.id === id)
    return cluster ? 1 + depth(cluster.parent) : 0
  }
  const boxes = new Map<string, Box>()
  const deepestFirst = [...input.clusters].sort(
    (a, b) => depth(b.id) - depth(a.id),
  )
  for (const cluster of deepestFirst) {
    const content = [
      ...input.nodes.flatMap((node) => {
        const box = node.parent === cluster.id && nodes.get(node.id)
        return box ? [box] : []
      }),
      ...input.clusters.flatMap((child) => {
        const box = child.parent === cluster.id && boxes.get(child.id)
        return box ? [box] : []
      }),
    ]
    let box = layoutBox(cluster.id)
    for (const inner of content) {
      box = union(box, {
        x: inner.x - CLUSTER_PADDING,
        y: inner.y - CLUSTER_PADDING,
        width: inner.width + CLUSTER_PADDING * 2,
        height: inner.height + CLUSTER_PADDING * 2,
      })
    }
    const contentTop = Math.min(...content.map((inner) => inner.y))
    const top = Math.min(
      box.y,
      contentTop - CLUSTER_PADDING / 2 - cluster.titleHeight,
    )
    boxes.set(cluster.id, { ...box, y: top, height: box.y + box.height - top })
  }
  return boxes
}

export function union(a: Box, b: Box): Box {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  }
}
