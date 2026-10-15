import { renderHook } from "@testing-library/react"
import type { WheelEvent } from "react"
import { afterEach, beforeEach, expect, test, vi } from "vitest"
import { useSpaceSwipe, useSpringLoad } from "./space-gestures"

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

const wheel = (deltaX: number, deltaY = 0) => ({ deltaX, deltaY }) as WheelEvent

test("a swipe needs 20 px across, clearly more across than down", () => {
  const onSwipe = vi.fn()
  const { result } = renderHook(() => useSpaceSwipe(onSwipe))

  result.current(wheel(19))
  result.current(wheel(30, 20)) // 30 is not > 1.5 × 20
  expect(onSwipe).not.toHaveBeenCalled()

  result.current(wheel(30, 19))
  expect(onSwipe).toHaveBeenLastCalledWith("team")
  vi.advanceTimersByTime(600)
  result.current(wheel(-20))
  expect(onSwipe).toHaveBeenLastCalledWith("private")
})

test("one swipe's stream of wheel events switches once per 600 ms", () => {
  const onSwipe = vi.fn()
  const { result } = renderHook(() => useSpaceSwipe(onSwipe))

  result.current(wheel(40))
  vi.advanceTimersByTime(599)
  result.current(wheel(-40))
  expect(onSwipe).toHaveBeenCalledTimes(1)

  vi.advanceTimersByTime(1)
  result.current(wheel(-40))
  expect(onSwipe).toHaveBeenCalledTimes(2)
  expect(onSwipe).toHaveBeenLastCalledWith("private")
})

test("spring-load fires 450 ms after arming; repeated arming doesn't restart it", () => {
  const fire = vi.fn()
  const { result } = renderHook(() => useSpringLoad(fire))

  result.current.arm()
  vi.advanceTimersByTime(300)
  result.current.arm() // dragover keeps firing while held
  vi.advanceTimersByTime(149)
  expect(fire).not.toHaveBeenCalled()
  vi.advanceTimersByTime(1)
  expect(fire).toHaveBeenCalledTimes(1)
})

test("leaving or dropping before 450 ms disarms the spring-load", () => {
  const fire = vi.fn()
  const { result } = renderHook(() => useSpringLoad(fire))

  result.current.arm()
  vi.advanceTimersByTime(449)
  result.current.disarm()
  vi.advanceTimersByTime(1000)
  expect(fire).not.toHaveBeenCalled()
})
