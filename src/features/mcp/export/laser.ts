// The outline of a constant-width freedraw stroke: Excalidraw's laser-pointer
// geometry (packages/laser-pointer, MIT), for one stroke size and without its
// simplify step, as freedraw uses it. Ported, not imported: Excalidraw
// bundles its own copy, which the npm package of the same version lags.

import type { Point } from "./elements"

type Vec = [number, number]

const add = ([ax, ay]: Vec, [bx, by]: Vec): Vec => [ax + bx, ay + by]
const sub = ([ax, ay]: Vec, [bx, by]: Vec): Vec => [ax - bx, ay - by]
const scale = ([x, y]: Vec, s: number): Vec => [x * s, y * s]
const mag = ([x, y]: Vec) => Math.sqrt(x ** 2 + y ** 2)
const norm = (v: Vec): Vec => [v[0] / mag(v), v[1] / mag(v)]
const rot = ([x, y]: Vec, rad: number): Vec => [
  Math.cos(rad) * x - Math.sin(rad) * y,
  Math.sin(rad) * x + Math.cos(rad) * y,
]
/** The turn at `p` from `p1` to `p2`. */
const angle = (p: Vec, p1: Vec, p2: Vec) =>
  Math.atan2(p2[1] - p[1], p2[0] - p[0]) -
  Math.atan2(p1[1] - p[1], p1[0] - p[0])
const normAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

const STEP = Math.PI / 16
const CORNER_MAX_ANGLE = (75 / 180) * Math.PI

/** `size` is the stroke's half width. */
export function laserOutline(
  input: readonly Point[],
  size: number,
  streamline: number,
): Vec[] {
  // Repeated points drop; each other point is pulled toward the one before.
  const points: Vec[] = []
  let previous: Point | undefined
  for (const point of input) {
    if (previous && previous[0] === point[0] && previous[1] === point[1])
      continue
    previous = point
    const last = points.at(-1)
    const [x, y] = point
    points.push(
      last && streamline > 0
        ? add(last, scale(sub([x, y], last), 1 - streamline))
        : [x, y],
    )
  }
  const len = points.length
  if (len === 0) return []

  if (len === 1) {
    if (size < 0.5) return []
    const [c] = points
    const dot: Vec[] = []
    for (let theta = 0; theta <= Math.PI * 2; theta += STEP)
      dot.push(add(c, scale(rot([1, 0], theta), size)))
    dot.push(add(c, [size, 0]))
    return dot
  }

  if (len === 2) {
    if (size < 0.5) return []
    const [c, n] = points
    const start = angle(c, [c[0], c[1] - 100], n)
    const capsule: Vec[] = []
    for (let theta = start; theta <= Math.PI + start; theta += STEP)
      capsule.push(add(c, scale(rot([1, 0], theta), size)))
    for (
      let theta = Math.PI + start;
      theta <= Math.PI * 2 + start;
      theta += STEP
    )
      capsule.push(add(n, scale(rot([1, 0], theta), size)))
    capsule.push(capsule[0])
    return capsule
  }

  if (size === 0) return []
  const forward: Vec[] = []
  const backward: Vec[] = []
  let prevSpeed = 0
  for (let i = 1; i < len - 1; i++) {
    const p = points[i - 1]
    const c = points[i]
    const n = points[i + 1]
    const speed = prevSpeed + (mag(sub(c, p)) - prevSpeed) * 0.2

    const dirPC = norm(sub(p, c))
    const dirNC = norm(sub(n, c))
    const p1dirPC = rot(dirPC, Math.PI / 2)
    const p2dirPC = rot(dirPC, -Math.PI / 2)
    const p1dirNC = rot(dirNC, Math.PI / 2)
    const p2dirNC = rot(dirNC, -Math.PI / 2)
    const p1PC = add(c, scale(p1dirPC, size))
    const p2PC = add(c, scale(p2dirPC, size))
    const p1NC = add(c, scale(p1dirNC, size))
    const p2NC = add(c, scale(p2dirNC, size))
    const ftdir = add(p1dirPC, p2dirNC)
    const btdir = add(p2dirPC, p1dirNC)
    const paPC = add(c, scale(mag(ftdir) === 0 ? dirPC : norm(ftdir), size))
    const paNC = add(c, scale(mag(btdir) === 0 ? dirNC : norm(btdir), size))

    const cAngle = normAngle(angle(c, p, n))
    // A sharp corner is rounded off; fast strokes round off fewer.
    if (Math.abs(cAngle) < CORNER_MAX_ANGLE * (speed > 35 ? 0.5 : 1)) {
      const tAngle = Math.abs(normAngle(Math.PI - cAngle))
      if (tAngle === 0) continue
      if (cAngle < 0) {
        backward.push(p2PC, paNC)
        for (let theta = 0; theta <= tAngle; theta += tAngle / 4)
          forward.push(add(c, rot(scale(p1dirPC, size), theta)))
        for (let theta = tAngle; theta >= 0; theta -= tAngle / 4)
          backward.push(add(c, rot(scale(p1dirPC, size), theta)))
        backward.push(paNC, p1NC)
      } else {
        forward.push(p1PC, paPC)
        for (let theta = 0; theta <= tAngle; theta += tAngle / 4)
          backward.push(add(c, rot(scale(p1dirPC, -size), -theta)))
        for (let theta = tAngle; theta >= 0; theta -= tAngle / 4)
          forward.push(add(c, rot(scale(p1dirPC, -size), -theta)))
        forward.push(paPC, p2NC)
      }
    } else {
      forward.push(paPC)
      backward.push(paNC)
    }
    prevSpeed = speed
  }

  const first = points[0]
  const ultimate = points[len - 1]
  const ppdirFS = rot(norm(sub(points[1], first)), -Math.PI / 2)
  const ppdirPU = rot(norm(sub(points[len - 2], ultimate)), Math.PI / 2)
  const startCap: Vec[] = []
  if (size > 0.1) {
    for (let theta = 0; theta <= Math.PI; theta += STEP)
      startCap.unshift(add(first, rot(scale(ppdirFS, size), -theta)))
    startCap.unshift(add(first, scale(ppdirFS, -size)))
  } else {
    startCap.push(first)
  }
  const endCap: Vec[] = []
  for (let theta = 0; theta <= Math.PI * 3; theta += STEP)
    endCap.push(add(ultimate, rot(scale(ppdirPU, -size), -theta)))

  return [
    ...startCap,
    ...forward,
    ...endCap.reverse(),
    ...backward.reverse(),
    startCap[0],
  ]
}
