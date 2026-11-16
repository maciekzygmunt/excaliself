// A sticky note's paper outline and date footer, ported from Excalidraw
// (element/src/stickyNote.ts, MIT). The note isn't drawn with rough.js: its
// corners are jittered from its seed, and a rough one lifts a corner.

import type { Element } from "./elements"

type P = { x: number; y: number }
/** A line to `point`, or a quadratic curve to it when it has a `control`. */
type Command = { control?: P; point: P }

const PADDING = 16
const SHADOW_OFFSET = 3
// Corner jitter, by the note's roughness (0, 1, 2).
const ROUGHNESS = [0, 1.5, 8]
const MONTHS = "Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec".split(" ")

/** Excalidraw's seededRandom. */
function seededRandom(seed: number) {
  let value = seed >>> 0
  return () => {
    value += 0x6d2b79f5
    let next = value
    next = Math.imul(next ^ (next >>> 15), next | 1)
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61)
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296
  }
}

function pointAtDistance(from: P, to: P, distance: number): P {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  if (!length) return from
  const ratio = Math.min(distance / length, 1)
  return { x: from.x + dx * ratio, y: from.y + dy * ratio }
}

function corners(element: Element, offset: number, seedOffset: number): P[] {
  const { width, height } = element
  const roughness = Math.max(0, Math.min(2, Math.round(element.roughness)))
  const amount = Math.min(ROUGHNESS[roughness], Math.min(width, height) * 0.012)
  const random = seededRandom(element.seed + seedOffset)
  const jitter = () => (amount ? (random() * 2 - 1) * amount : 0)
  // Evaluated in this order: x before y, corners clockwise from the top left.
  return [
    [0, 0],
    [width, 0],
    [width, height],
    [0, height],
  ].map(([x, y]) => ({ x: offset + x + jitter(), y: offset + y + jitter() }))
}

/** The path of the note's paper, or of the shadow under it. */
export function stickyNotePath(element: Element, shadow = false) {
  const points = shadow
    ? corners(element, SHADOW_OFFSET, 1)
    : corners(element, 0, 0)
  const size = Math.min(element.width, element.height)
  const radius = element.roundness ? Math.min(size * 0.04, 16) : 0
  // The seed keeps the same corner lifted through redraws and resizes.
  const liftedCorner =
    element.roughness === 2
      ? Math.floor(seededRandom(element.seed)() * points.length)
      : -1

  let commands: Command[]
  if (!radius && liftedCorner === -1) {
    commands = points.map((point) => ({ point }))
  } else {
    const rounded = points.map((point, index): Command[] => {
      const prev = points[(index + points.length - 1) % points.length]
      const next = points[(index + 1) % points.length]
      const cornerRadius = Math.min(
        radius,
        Math.hypot(point.x - prev.x, point.y - prev.y) / 2,
        Math.hypot(point.x - next.x, point.y - next.y) / 2,
      )
      if (index !== liftedCorner) {
        return [
          { point: pointAtDistance(point, prev, cornerRadius) },
          {
            control: point,
            point: pointAtDistance(point, next, cornerRadius),
          },
        ]
      }
      const reach = Math.min(size * 0.18, 40)
      // The shadow follows the paper inward at half the bend.
      const lift = Math.min(size * 0.02, 5) * (shadow ? 0.5 : 1)
      const tip = {
        x: point.x + (index === 1 || index === 2 ? -lift : lift),
        y: point.y + (index >= 2 ? -lift : lift),
      }
      const start = pointAtDistance(point, prev, reach)
      const end = pointAtDistance(point, next, reach)
      return [
        { point: start },
        {
          control: pointAtDistance(point, prev, reach / 2),
          point: pointAtDistance(tip, start, cornerRadius),
        },
        { control: tip, point: pointAtDistance(tip, end, cornerRadius) },
        { control: pointAtDistance(point, next, reach / 2), point: end },
      ]
    })
    // Starts where the first corner ends, and closes through that corner.
    commands = [
      { point: rounded[0][rounded[0].length - 1].point },
      ...rounded.slice(1).flat(),
      ...rounded[0],
    ]
  }
  return `${commands
    .map(({ control, point }, index) =>
      index === 0
        ? `M ${point.x} ${point.y}`
        : control
          ? `Q ${control.x} ${control.y} ${point.x} ${point.y}`
          : `L ${point.x} ${point.y}`,
    )
    .join(" ")} Z`
}

/**
 * The note's creation date and where it goes, in the note's coordinates: a
 * short English date in the server's time zone, with the year unless it is
 * this year or the note is narrow. Null for a note with no known date.
 */
export function stickyNoteFooter(element: Element) {
  const { created, width, height } = element
  if (created === null) return null
  const date = new Date(created)
  if (Number.isNaN(date.getTime())) return null
  const label = `${date.getDate()} ${MONTHS[date.getMonth()]}`
  const year = date.getFullYear()
  const short = width - PADDING * 2 < 80 || year === new Date().getFullYear()
  return {
    text: short ? label : `${label} ${year}`,
    x: width - PADDING,
    y: height - 14,
  }
}
