// Geometry for the hero sketch: three teammates send drawings through Excaliself into one
// database, inside a dashed "your server" boundary. Two layouts: wide (tablet and up) and tall (phones).
import { arrow, cylinder, ellipse, fills, ink, line, pen, rect, type Part } from "./sketch"

type Point = [number, number]

/** Where one drawing travels. The page script reads these from data-routes. */
export type Route = { start: Point; in: Point; boxIn: Point; boxOut: Point; dbIn: Point; dbTop: Point }

type Spec = {
  size: Point
  people: Point[] // head-and-shoulders center
  nameBelow: number // name baseline offset under each person
  cardAt: [number, number, number][] // each person's drawing: center x, y, rotation
  teamLabel: Point
  arrows: Point[][] // one per person, ending at the app box
  out: Point[] // app box → database
  note: { at: Point; anchor: "start" | "middle"; lines: string[] }
  server: { x: number; y: number; w: number; h: number; label: Point }
  app: { x: number; y: number; w: number; h: number }
  db: { cx: number; top: number; bottom: number; rx: number; ry: number; label: number }
  slots: { cols: number; rows: number; w: number; h: number; gap: number; top: number }
}

const CARD_SCALE = 0.55

const specs: Record<"wide" | "tall", Spec> = {
  wide: {
    size: [1200, 410],
    people: [[70, 92], [70, 202], [70, 312]],
    nameBelow: 48,
    cardAt: [[176, 96, -5], [180, 206, 4], [174, 316, -3]],
    teamLabel: [118, 30],
    arrows: [
      [[230, 100], [350, 150], [452, 196]],
      [[234, 206], [350, 214], [452, 226]],
      [[228, 312], [350, 290], [452, 256]],
    ],
    out: [[714, 226], [790, 234], [866, 226]],
    note: { at: [330, 352], anchor: "middle", lines: ["saves as", "you draw"] },
    server: { x: 400, y: 64, w: 780, h: 330, label: [418, 50] },
    app: { x: 456, y: 162, w: 250, h: 128 },
    db: { cx: 1012, top: 116, bottom: 318, rx: 112, ry: 30, label: 172 },
    slots: { cols: 3, rows: 3, w: 52, h: 32, gap: 10, top: 196 },
  },
  tall: {
    size: [360, 860],
    people: [[66, 66], [180, 66], [294, 66]],
    nameBelow: 48,
    cardAt: [[66, 172, -5], [180, 176, 4], [294, 172, -3]],
    teamLabel: [180, 20],
    arrows: [
      [[72, 206], [96, 290], [150, 346]],
      [[180, 210], [186, 280], [180, 346]],
      [[288, 206], [264, 290], [210, 346]],
    ],
    out: [[180, 478], [173, 520], [180, 562]],
    note: { at: [198, 516], anchor: "start", lines: ["saves as", "you draw"] },
    server: { x: 14, y: 312, w: 332, h: 506, label: [28, 846] },
    app: { x: 55, y: 352, w: 250, h: 116 },
    db: { cx: 180, top: 606, bottom: 772, rx: 112, ry: 28, label: 656 },
    slots: { cols: 4, rows: 3, w: 40, h: 24, gap: 8, top: 674 },
  },
}

// One drawing per teammate, each with a tiny sketch inside.
const people = [
  { name: "Mira", shirt: fills.violet, title: "Signup flow", boxes: [fills.blue, fills.green, fills.yellow], kind: "row" },
  { name: "Tomasz", shirt: fills.green, title: "Service map", boxes: [fills.blue, fills.yellow, fills.violet], kind: "map" },
  { name: "Priya", shirt: fills.yellow, title: "Sprint retro", boxes: [fills.green, fills.red, fills.yellow], kind: "notes" },
] as const

function card(i: number): Part[] {
  const d = people[i]
  const seed = 100 + i * 20
  const thin = { width: 1.4, roughness: 0.8 }
  const frame = rect(-75, -50, 150, 100, { seed, fill: "#ffffff", r: 10, width: 2.4 })
  const inner: Part[] = []
  if (d.kind === "notes") {
    d.boxes.forEach((c, j) => inner.push(...rect(-60 + j * 42, -14, 34, 48, { ...thin, seed: seed + j + 1, fill: c, r: 3 })))
  } else if (d.kind === "map") {
    inner.push(...rect(-62, -6, 36, 22, { ...thin, seed: seed + 1, fill: d.boxes[0], r: 11 }))
    inner.push(...rect(4, -14, 40, 20, { ...thin, seed: seed + 2, fill: d.boxes[1], r: 4 }))
    inner.push(...rect(4, 16, 40, 20, { ...thin, seed: seed + 3, fill: d.boxes[2], r: 4 }))
    inner.push(...arrow([[-24, 4], [2, -4]], { ...thin, seed: seed + 4, head: 6 }))
    inner.push(...arrow([[-24, 8], [2, 24]], { ...thin, seed: seed + 6, head: 6 }))
  } else {
    d.boxes.forEach((c, j) => inner.push(...rect(-64 + j * 46, 0, 32, 22, { ...thin, seed: seed + j + 1, fill: c, r: 4 })))
    inner.push(...arrow([[-31, 11], [-19, 11]], { ...thin, seed: seed + 5, head: 5 }))
    inner.push(...arrow([[15, 11], [27, 11]], { ...thin, seed: seed + 7, head: 5 }))
  }
  return [...frame, ...inner]
}

/** Head and shoulders, the way people get drawn on whiteboards. */
function person([x, y]: Point, i: number): Part[] {
  const seed = 400 + i * 10
  return [
    ...rect(x - 24, y + 2, 48, 30, { seed, fill: people[i].shirt, r: 15 }),
    ...ellipse(x, y - 14, 30, 30, { seed: seed + 2, fill: "#ffffff" }),
  ]
}

const slotColors = [fills.blue, fills.green, fills.yellow, fills.violet, fills.red]

export function heroDiagram(layout: "wide" | "tall") {
  const s = specs[layout]
  const { db, app, server, slots } = s
  const boxOut: Point = layout === "wide" ? [app.x + app.w - 6, app.y + app.h / 2] : [app.x + app.w / 2, app.y + app.h - 6]
  // Slots inside the cylinder, bottom row first. The bottom row starts filled.
  const left = db.cx - (slots.cols * slots.w + (slots.cols - 1) * slots.gap) / 2
  const cells = Array.from({ length: slots.cols * slots.rows }, (_, k) => {
    const row = slots.rows - 1 - Math.floor(k / slots.cols)
    const col = k % slots.cols
    const x = left + col * (slots.w + slots.gap)
    const y = slots.top + row * (slots.h + slots.gap)
    return {
      center: [x + slots.w / 2, y + slots.h / 2] as Point,
      filled: k < slots.cols,
      parts: rect(x, y, slots.w, slots.h, { seed: 500 + k, fill: slotColors[k % slotColors.length], width: 1.4, r: 4 }),
    }
  })
  const routes: Route[] = s.arrows.map((a, i) => ({
    start: [s.cardAt[i][0], s.cardAt[i][1]],
    in: a[0],
    boxIn: a[a.length - 1],
    boxOut,
    dbIn: s.out[s.out.length - 1],
    dbTop: [db.cx, db.top + 6],
  }))
  return {
    ...s,
    cardScale: CARD_SCALE,
    names: people.map((p) => p.name),
    titles: people.map((p) => p.title),
    figures: s.people.map(person),
    cards: s.cardAt.map((_, i) => card(i)),
    arrows: [...s.arrows.map((points, i) => arrow(points, { seed: 10 + i * 3, width: 2 })), arrow(s.out, { seed: 20, width: 2 })],
    server: {
      ...server,
      parts: rect(server.x, server.y, server.w, server.h, { seed: 30, stroke: pen, width: 2, roughness: 0.6, r: 28 }),
    },
    app: { ...app, parts: rect(app.x, app.y, app.w, app.h, { seed: 40, fill: fills.violet, r: 16 }) },
    db: { ...db, parts: cylinder(db.cx, db.top, db.bottom, db.rx, db.ry, { seed: 50, fill: "#ffffff" }) },
    cells,
    routes,
    // The autosave packet: a tiny sheet with one fresh stroke on it.
    packet: [
      ...rect(-18, -13, 36, 26, { seed: 60, fill: fills.yellow, stroke: ink, width: 1.6, r: 4 }),
      ...line([[-10, 2], [-2, -4], [4, 3], [11, -3]], { seed: 62, stroke: ink, width: 1.6 }),
    ],
    ink,
    pen,
  }
}
