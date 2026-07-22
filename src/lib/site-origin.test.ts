import { describe, expect, it } from "vitest"
import { resolveOrigin } from "./site-origin"

describe("resolveOrigin", () => {
  it("prefers a configured BASE_URL over request headers", () => {
    expect(
      resolveOrigin({
        baseUrl: "https://draw.example.com",
        headers: new Headers({ host: "internal:3000" }),
        requestUrl: "http://internal:3000/login",
      }),
    ).toBe("https://draw.example.com")
  })

  it("strips any path from BASE_URL down to the origin", () => {
    expect(
      resolveOrigin({
        baseUrl: "https://draw.example.com/app/",
        headers: new Headers(),
        requestUrl: "http://internal:3000/",
      }),
    ).toBe("https://draw.example.com")
  })

  it("derives from forwarded headers behind a reverse proxy", () => {
    expect(
      resolveOrigin({
        headers: new Headers({
          host: "internal:3000",
          "x-forwarded-host": "draw.example.com",
          "x-forwarded-proto": "https",
        }),
        requestUrl: "http://internal:3000/login",
      }),
    ).toBe("https://draw.example.com")
  })

  it("uses the first entry of a multi-hop x-forwarded-proto", () => {
    expect(
      resolveOrigin({
        headers: new Headers({
          "x-forwarded-host": "draw.example.com",
          "x-forwarded-proto": "https, http",
        }),
        requestUrl: "http://internal:3000/",
      }),
    ).toBe("https://draw.example.com")
  })

  it("falls back to the Host header, then the request URL", () => {
    expect(
      resolveOrigin({
        headers: new Headers({ host: "localhost:3000" }),
        requestUrl: "http://localhost:3000/login",
      }),
    ).toBe("http://localhost:3000")
    expect(
      resolveOrigin({
        headers: new Headers(),
        requestUrl: "http://127.0.0.1:3000/login",
      }),
    ).toBe("http://127.0.0.1:3000")
  })
})
