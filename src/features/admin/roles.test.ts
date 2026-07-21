import { expect, test } from "vitest"
import { adminIds, isLastAdmin } from "./roles"

const user = (id: string, role: "admin" | "user") => ({ id, role })

test("adminIds picks out the admin rows", () => {
  expect(
    adminIds([user("a", "admin"), user("b", "user"), user("c", "admin")]),
  ).toEqual(["a", "c"])
  expect(adminIds([user("b", "user")])).toEqual([])
})

test("the sole admin is the last admin", () => {
  expect(isLastAdmin(["a"], "a")).toBe(true)
})

test("an admin among several is not the last admin", () => {
  expect(isLastAdmin(["a", "c"], "a")).toBe(false)
})

test("a non-admin target is never the last admin", () => {
  // Demoting someone who is already a member must stay a permitted no-op
  // even when only one admin exists.
  expect(isLastAdmin(["a"], "b")).toBe(false)
})

test("with no admins at all nothing is blocked", () => {
  expect(isLastAdmin([], "a")).toBe(false)
})
