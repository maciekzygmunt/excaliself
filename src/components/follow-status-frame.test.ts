import { cleanup, renderHook } from "@testing-library/react"
import { afterEach, expect, test, vi } from "vitest"
import type { Participant } from "@/features/collab/protocol"
import { useFollowStatusFrame } from "./follow-status-frame"

afterEach(cleanup)

const wren: Participant = {
  connectionId: "peer-wren",
  name: "Wren",
  color: { background: "#fa5252", stroke: "#c92a2a" },
  isGuest: true,
  image: null,
}

const frameFor = (
  followedParticipant: Participant | null,
  stopFollowing: () => void = () => {},
) =>
  renderHook(() =>
    useFollowStatusFrame({
      others: [],
      followedParticipant,
      toggleFollow: () => {},
      stopFollowing,
    }),
  ).result.current

test("following nobody draws no chrome", () => {
  expect(frameFor(null)).toBeNull()
})

test("the ring wears the followed person's cursor color, and the badge names them", () => {
  const frame = frameFor(wren)
  expect(frame?.border).toBe("#fa5252")
  expect(frame?.label?.label).toBe("Following Wren — click to stop")
})

test("clicking the badge stops following", () => {
  const onStop = vi.fn()
  frameFor(wren, onStop)?.label?.onClick?.()
  expect(onStop).toHaveBeenCalledOnce()
})
