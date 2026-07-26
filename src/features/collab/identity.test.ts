import { expect, test } from "vitest"
import {
  guestNameForConnection,
  initialsOf,
  memberDisplayName,
  PARTICIPANT_COLORS,
  pickParticipantColor,
} from "./identity"

test("a connection's pseudonym is stable and human-shaped", () => {
  const name = guestNameForConnection("2f9c1b2e-0000-4000-8000-000000000001")
  expect(name).toBe(
    guestNameForConnection("2f9c1b2e-0000-4000-8000-000000000001"),
  )
  expect(name).toMatch(/^[A-Z][a-z]+ [A-Z][a-z]+$/)
})

test("different connections mostly get different pseudonyms", () => {
  const names = new Set(
    Array.from({ length: 25 }, (_, i) => guestNameForConnection(`peer-${i}`)),
  )
  expect(names.size).toBeGreaterThan(20)
})

test("a member's display name comes from the session, falling back to the email local part", () => {
  expect(memberDisplayName({ name: "Ada Lovelace", email: "ada@x.dev" })).toBe(
    "Ada Lovelace",
  )
  expect(memberDisplayName({ name: "   ", email: "ada@x.dev" })).toBe("ada")
  expect(memberDisplayName({ name: null, email: null })).toBe("Member")
})

test("colors are handed out without repeating while the palette lasts", () => {
  const taken: ReturnType<typeof pickParticipantColor>[] = []
  for (let i = 0; i < PARTICIPANT_COLORS.length; i++) {
    taken.push(pickParticipantColor(taken))
  }
  expect(new Set(taken.map((c) => c.background)).size).toBe(
    PARTICIPANT_COLORS.length,
  )
})

test("a freed color is reused before the palette wraps", () => {
  const first = pickParticipantColor([])
  const second = pickParticipantColor([first])
  expect(second).not.toEqual(first)
  // The first participant leaves; the next joiner takes their color back.
  expect(pickParticipantColor([second])).toEqual(first)
})

test("past the palette's length colors wrap instead of running out", () => {
  const taken = [...PARTICIPANT_COLORS]
  expect(PARTICIPANT_COLORS).toContainEqual(pickParticipantColor(taken))
})

test("initials come from the first and last word", () => {
  expect(initialsOf("Ada Lovelace")).toBe("AL")
  expect(initialsOf("Quiet Otter")).toBe("QO")
  expect(initialsOf("Wren")).toBe("W")
  expect(initialsOf("  ada  van  der  berg ")).toBe("AB")
  expect(initialsOf("   ")).toBe("?")
})
