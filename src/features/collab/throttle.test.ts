import { afterEach, expect, test, vi } from "vitest"
import { createDroppableThrottle, createTrailingThrottle } from "./throttle"

afterEach(() => {
  vi.useRealTimers()
})

test("the cursor throttle passes the first update and drops the rest of the window", () => {
  let clock = 1000
  const allow = createDroppableThrottle(33, () => clock)

  expect(allow()).toBe(true)
  clock += 10
  expect(allow()).toBe(false)
  clock += 10
  expect(allow()).toBe(false)
  clock += 20
  expect(allow()).toBe(true)
})

test("the very first update is never held back", () => {
  const allow = createDroppableThrottle(33, () => 0)
  expect(allow()).toBe(true)
})

test("the viewport throttle sends the first frame at once", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  const throttle = createTrailingThrottle<number>(33, (v) => {
    sent.push(v)
    return true
  })

  throttle.push(1)
  expect(sent).toEqual([1])
})

test("the last frame of a burst still lands, once the window is up", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  const throttle = createTrailingThrottle<number>(33, (v) => {
    sent.push(v)
    return true
  })

  throttle.push(1)
  vi.advanceTimersByTime(5)
  throttle.push(2)
  vi.advanceTimersByTime(5)
  throttle.push(3)
  expect(sent).toEqual([1])

  vi.advanceTimersByTime(33)
  expect(sent).toEqual([1, 3])
  // The trailing flush counts as a send, so the window restarts with it.
  throttle.push(4)
  expect(sent).toEqual([1, 3])
  vi.advanceTimersByTime(33)
  expect(sent).toEqual([1, 3, 4])
})

test("a frame past the window goes straight out", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  const throttle = createTrailingThrottle<number>(33, (v) => {
    sent.push(v)
    return true
  })

  throttle.push(1)
  vi.advanceTimersByTime(40)
  throttle.push(2)
  expect(sent).toEqual([1, 2])
})

test("cancelling drops the frame still waiting to go out", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  const throttle = createTrailingThrottle<number>(33, (v) => {
    sent.push(v)
    return true
  })

  throttle.push(1)
  throttle.push(2)
  throttle.cancel()
  vi.advanceTimersByTime(100)
  expect(sent).toEqual([1])
})

test("a frame the run refuses is held and retried, not lost", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  let accepting = false
  const throttle = createTrailingThrottle<number>(33, (v) => {
    if (!accepting) return false
    sent.push(v)
    return true
  })

  throttle.push(1)
  vi.advanceTimersByTime(200)
  expect(sent).toEqual([])

  // Nothing new arrives — the held frame is all that can put the follower
  // back where it belongs, so draining has to be enough on its own.
  accepting = true
  vi.advanceTimersByTime(33)
  expect(sent).toEqual([1])
})

test("a newer frame supersedes the one being retried", () => {
  vi.useFakeTimers()
  const sent: number[] = []
  let accepting = false
  const throttle = createTrailingThrottle<number>(33, (v) => {
    if (!accepting) return false
    sent.push(v)
    return true
  })

  throttle.push(1)
  vi.advanceTimersByTime(50)
  throttle.push(2)
  accepting = true
  vi.advanceTimersByTime(50)
  expect(sent).toEqual([2])
})
