// Mermaid flowcharts as scene skeletons. Mermaid's own parser renders with a
// browser DOM, so this reads the flowchart syntax itself: nodes and their
// shapes, edges and their labels and styles, and subgraphs. Styling lines
// (classDef, style, click, ...) are skipped.

import { SceneInputError } from "./build"
import type {
  Cluster,
  ConnectorSkeleton,
  Direction,
  SceneGraph,
  ShapeSkeleton,
} from "./skeleton"

type Shape = ShapeSkeleton["type"]

// Longest opener first, so "((" is not read as "(".
const NODE_SHAPES: [open: string, close: string, shape: Shape][] = [
  ["(((", ")))", "ellipse"],
  ["((", "))", "ellipse"],
  ["([", "])", "rectangle"],
  ["[[", "]]", "rectangle"],
  ["[(", ")]", "rectangle"],
  ["[/", "/]", "rectangle"],
  ["[\\", "\\]", "rectangle"],
  ["[/", "\\]", "rectangle"],
  ["[\\", "/]", "rectangle"],
  ["{{", "}}", "rectangle"],
  ["(", ")", "rectangle"],
  ["[", "]", "rectangle"],
  ["{", "}", "diamond"],
  [">", "]", "rectangle"],
]

const SKIPPED =
  /^(classDef|class|style|linkStyle|click|accTitle|accDescr|direction)\b/
const NODE_ID = /^[\p{L}\p{N}_]+(?:[-.][\p{L}\p{N}_]+)*/u
// `-- text -->`, `-. text .->`, `== text ==>`
const INLINE_LABEL_EDGE =
  /^(<)?(--|-\.|==)\s+(.+?)\s+(-{2,}>|-{3,}|\.-+>|\.-+|={2,}>|={3,})/
// `-->`, `---`, `-.->`, `==>`, `===`, `--o`, `--x`, `<-->`, `~~~`
const EDGE = /^(<)?(-{2,}|-\.+-|={2,}|~{3,})(>|o(?=[\s|])|x(?=[\s|]))?/

type Edge = Pick<
  ConnectorSkeleton,
  "label" | "strokeStyle" | "strokeWidth" | "startArrowhead" | "endArrowhead"
> & { invisible: boolean }

/** Parses a Mermaid flowchart. Throws SceneInputError on anything else. */
export function parseMermaid(source: string): SceneGraph {
  // Front matter: `---`, `title: ...`, `---`
  const frontMatter = source.match(/^\s*---\r?\n([\s\S]*?)\r?\n---[^\n]*\n/)
  const title = frontMatter?.[1].match(/^title:\s*(.+)$/m)?.[1].trim()
  const statements = splitStatements(
    frontMatter ? source.slice(frontMatter[0].length) : source,
  )
  const header = statements.shift()?.match(/^(flowchart|graph)(?:\s+(\w+))?$/i)
  if (!header) {
    throw new SceneInputError(
      'Only Mermaid flowcharts are supported: start with "flowchart TD" or "graph LR". For other diagrams, send elements instead.',
    )
  }
  const direction = toDirection(header[2])

  const shapes = new Map<string, ShapeSkeleton>()
  const connectors: ConnectorSkeleton[] = []
  const clusters: Cluster[] = []
  // As Mermaid does, a node belongs to the first subgraph to close that
  // mentions it, so inner subgraphs claim theirs before outer ones.
  const open: { cluster: Cluster; mentioned: Set<string> }[] = []
  const claimed = new Set<string>()

  const addNode = (id: string, label?: string, type?: Shape) => {
    open.at(-1)?.mentioned.add(id)
    const existing = shapes.get(id)
    if (existing) {
      if (label !== undefined) existing.label = label
      if (type) existing.type = type
      return
    }
    shapes.set(id, { type: type ?? "rectangle", id, label: label ?? id })
  }

  for (const statement of statements) {
    if (SKIPPED.test(statement)) continue
    const subgraph = statement.match(/^subgraph\s+(.+)$/)
    if (subgraph) {
      const { id, label } = parseSubgraphTitle(subgraph[1])
      const cluster: Cluster = {
        id,
        label,
        parent: open.at(-1)?.cluster.id ?? null,
        members: [],
      }
      clusters.push(cluster)
      open.push({ cluster, mentioned: new Set() })
      continue
    }
    if (statement === "end") {
      const closing = open.pop()
      if (!closing)
        throw new SceneInputError('Mermaid: "end" without a subgraph.')
      for (const id of closing.mentioned) {
        if (claimed.has(id)) continue
        claimed.add(id)
        closing.cluster.members.push(id)
      }
      continue
    }
    parseChain(statement, addNode, (from, to, edge) => {
      for (const source of from)
        for (const target of to)
          if (!edge.invisible) {
            const { invisible: _, ...style } = edge
            connectors.push({
              type: "arrow",
              from: source,
              to: target,
              ...style,
            })
          }
    })
  }

  // A subgraph can be named by an edge before it is declared; it is a
  // cluster, not a node.
  if (open.length > 0) {
    throw new SceneInputError(
      `Mermaid: subgraph "${open[0].cluster.id}" has no "end".`,
    )
  }
  for (const cluster of clusters) {
    shapes.delete(cluster.id)
    for (const other of clusters) {
      other.members = other.members.filter((member) => member !== cluster.id)
    }
  }

  return {
    elements: [
      ...(title ? [{ type: "text" as const, text: title, fontSize: 28 }] : []),
      ...shapes.values(),
      ...connectors,
    ],
    clusters,
    direction,
  }
}

function toDirection(value: string | undefined): Direction {
  switch (value?.toUpperCase()) {
    case "LR":
      return "LR"
    case "RL":
      return "RL"
    case "BT":
      return "BT"
    default:
      return "TB"
  }
}

/** Lines, then `;`-separated statements, outside of quotes and brackets. */
function splitStatements(source: string): string[] {
  const statements: string[] = []
  for (const line of source.split(/\r?\n/)) {
    if (line.trim().startsWith("%%")) continue
    let depth = 0
    let quoted = false
    let current = ""
    for (const char of line) {
      if (char === '"') quoted = !quoted
      else if (!quoted && "[({".includes(char)) depth++
      else if (!quoted && "])}".includes(char)) depth = Math.max(0, depth - 1)
      if (char === ";" && depth === 0 && !quoted) {
        statements.push(current)
        current = ""
      } else current += char
    }
    statements.push(current)
  }
  return statements.map((statement) => statement.trim()).filter(Boolean)
}

function parseSubgraphTitle(title: string): { id: string; label: string } {
  // `id [Title]` or `id["Title"]`
  const bracketed = title.match(/^([^\s[]+)\s*\[\s*"?(.*?)"?\s*\]$/)
  if (bracketed) return { id: bracketed[1], label: cleanLabel(bracketed[2]) }
  const quoted = title.match(/^"(.*)"$/)
  if (quoted) return { id: quoted[1], label: cleanLabel(quoted[1]) }
  return { id: title, label: cleanLabel(title) }
}

/** `<br>` becomes a line break; quotes, other markup, and entity codes go. */
function cleanLabel(label: string): string {
  return label
    .trim()
    .replace(/^"([\s\S]*)"$/, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/#quot;/g, '"')
    .replace(/#amp;/g, "&")
    .replace(/#lt;/g, "<")
    .replace(/#gt;/g, ">")
    .replace(/^`|`$/g, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .trim()
}

/** `A & B --> C -->|label| D`: node groups joined by edges. */
function parseChain(
  statement: string,
  addNode: (id: string, label?: string, type?: Shape) => void,
  addEdges: (from: string[], to: string[], edge: Edge) => void,
) {
  let rest = statement
  const fail = (): never => {
    throw new SceneInputError(`Mermaid: can't read "${statement}".`)
  }

  const readGroup = (): string[] => {
    const ids: string[] = []
    for (;;) {
      rest = rest.trimStart()
      const id = rest.match(NODE_ID)?.[0] ?? fail()
      rest = rest.slice(id.length)
      const shape = readShape()
      addNode(id, shape?.label, shape?.type)
      // `:::className`
      rest = rest.replace(/^:::[\w-]+/, "").trimStart()
      ids.push(id)
      if (!rest.startsWith("&")) return ids
      rest = rest.slice(1)
    }
  }

  const readShape = (): { label: string; type: Shape } | null => {
    for (const [openToken, closeToken, type] of NODE_SHAPES) {
      if (!rest.startsWith(openToken)) continue
      const body = rest.slice(openToken.length)
      const quoted = body.match(/^\s*"((?:[^"\\]|\\.)*)"\s*/)
      const end = quoted ? quoted[0].length : body.indexOf(closeToken)
      if (end === -1 || !body.slice(end).startsWith(closeToken)) continue
      rest = body.slice(end + closeToken.length)
      return {
        label: cleanLabel(quoted ? quoted[1] : body.slice(0, end)),
        type,
      }
    }
    return null
  }

  const readEdge = (): Edge | null => {
    rest = rest.trimStart()
    const inline = rest.match(INLINE_LABEL_EDGE)
    const plain = inline ? null : rest.match(EDGE)
    const match = inline ?? plain
    if (!match) return null
    rest = rest.slice(match[0].length)
    const body = inline ? `${inline[2]}${inline[4]}` : (plain?.[2] ?? "")
    const head = inline ? inline[4].at(-1) : plain?.[3]
    let label = inline ? cleanLabel(inline[3]) : undefined
    const piped = rest.match(/^\s*\|([^|]*)\|/)
    if (piped) {
      label = cleanLabel(piped[1])
      rest = rest.slice(piped[0].length)
    }
    const arrowhead = (char: string | undefined) =>
      char === ">" || char === "<"
        ? "arrow"
        : char === "o"
          ? "circle"
          : char === "x"
            ? "bar"
            : null
    return {
      label: label || undefined,
      strokeStyle: body.includes(".") ? "dashed" : "solid",
      strokeWidth: body.includes("=") ? 4 : 2,
      startArrowhead: arrowhead(match[1]),
      endArrowhead: arrowhead(head),
      invisible: body.startsWith("~"),
    }
  }

  let from = readGroup()
  for (;;) {
    const edge = readEdge()
    if (!edge) break
    const to = readGroup()
    addEdges(from, to, edge)
    from = to
  }
  if (rest.trim()) fail()
}
