import { afterEach, expect, test } from "vitest"
import { baseLocale, overwriteGetLocale } from "@/paraglide/runtime"
import { authErrorMessage } from "./errors"

afterEach(() => overwriteGetLocale(() => baseLocale))

test("a known Better Auth code shows our message in the user's language", () => {
  overwriteGetLocale(() => "pl-PL")
  expect(
    authErrorMessage(
      {
        code: "INVALID_EMAIL_OR_PASSWORD",
        message: "Invalid email or password",
        status: 401,
      },
      "fallback",
    ),
  ).toBe("Nieprawidłowy e-mail lub hasło")
})

test("an unknown code keeps Better Auth's message, else the fallback", () => {
  overwriteGetLocale(() => "pl-PL")
  expect(
    authErrorMessage({ code: "SOMETHING_NEW", message: "Something new" }, "x"),
  ).toBe("Something new")
  expect(authErrorMessage({}, "Logowanie nie powiodło się")).toBe(
    "Logowanie nie powiodło się",
  )
})

test("the rate limiter's 429 has no code but still gets our message", () => {
  expect(
    authErrorMessage(
      { message: "Too many requests. Please try again later.", status: 429 },
      "x",
    ),
  ).toBe("Too many attempts. Try again in a minute.")
})
