import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, test } from "vitest"
import { THEME_COLORS } from "./theme"

// Guards the Etched token table (.scratch/etched-redesign/spec.md): both
// blocks must be designed hex/rgba values (no generated oklch leftovers in
// dark), every Etched surface-recipe token must exist in both modes, key
// text/accent pairs must hold WCAG AA on the surfaces they actually sit
// on, and the theme-color meta tints in theme.ts must match the CSS
// --background tokens.

const css = readFileSync(join(__dirname, "../styles.css"), "utf8")

function tokensOf(block: string): Record<string, string> {
  const body = css.match(new RegExp(`${block}\\s*\\{([^}]*)\\}`))?.[1]
  if (!body) throw new Error(`no ${block} block in styles.css`)
  const tokens: Record<string, string> = {}
  for (const [, name, value] of body.matchAll(/(--[\w-]+):\s*([^;]+);/g)) {
    tokens[name] = value.trim()
  }
  return tokens
}

const dark = tokensOf("\\.dark")
const root = tokensOf(":root")

type Rgb = [number, number, number]

// Parses #rrggbb directly; rgba(r, g, b, a) is composited over `base`,
// since a wash only has a contrast once it sits on a surface.
function toRgb(value: string, base?: Rgb): Rgb {
  const hex = value.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (hex) {
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb
  }
  const rgba = value.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/)
  if (rgba && base) {
    const alpha = Number(rgba[4])
    return base.map((b, i) =>
      Math.round(Number(rgba[i + 1]) * alpha + b * (1 - alpha)),
    ) as Rgb
  }
  throw new Error(`unparseable color: ${value}`)
}

function luminance([r, g, b]: Rgb): number {
  const f = (v: number) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}

function contrast(fg: Rgb, bg: Rgb): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a)
  return (hi + 0.05) / (lo + 0.05)
}

test("the .dark block is fully designed — no generated oklch values remain", () => {
  for (const [name, value] of Object.entries(dark)) {
    expect(value, name).not.toContain("oklch(")
  }
})

test("theme-color meta tints match the CSS --background tokens", () => {
  expect(THEME_COLORS.light).toBe(root["--background"])
  expect(THEME_COLORS.dark).toBe(dark["--background"])
})

test("the legacy notion-* aliases are gone", () => {
  expect(css).not.toContain("notion-")
})

// The Etched surface recipes are encoded once as tokens; every recipe slot
// must be designed in both modes, never derived or defaulted.
const ETCHED_TOKENS = [
  "--panel",
  "--panel-shadow",
  "--keycap-from",
  "--keycap-to",
  "--keycap-to-active",
  "--keycap-border",
  "--keycap-border-hover",
  "--keycap-shadow",
  "--card-from",
  "--card-to",
  "--card-border",
  "--card-border-hover",
  "--card-shadow",
  "--card-hover-shadow",
  "--well",
  "--well-hover",
  "--well-shadow",
  "--kbd-shadow",
  "--hairline",
  "--popover-shadow",
]

test.each(ETCHED_TOKENS)("%s is defined in both modes", (token) => {
  expect(root[token], `:root ${token}`).toBeTruthy()
  expect(dark[token], `.dark ${token}`).toBeTruthy()
})

function pairContrast(
  tokens: Record<string, string>,
  fg: string,
  bg: string,
  base?: string,
) {
  const baseRgb = base ? toRgb(tokens[base]) : undefined
  return contrast(toRgb(tokens[fg], baseRgb), toRgb(tokens[bg], baseRgb))
}

describe("dark AA contrast", () => {
  const on = (fg: string, bg: string, base?: string) =>
    pairContrast(dark, fg, bg, base)

  test.each([
    ["--foreground", "--background"],
    ["--foreground", "--panel"],
    ["--card-foreground", "--card"],
    ["--popover-foreground", "--popover"],
    ["--secondary-foreground", "--secondary"],
    ["--muted-foreground", "--background"],
    ["--muted-foreground", "--panel"],
    ["--muted-foreground", "--card"],
    ["--muted-foreground", "--popover"],
    ["--muted-foreground", "--secondary"],
    ["--sidebar-foreground", "--sidebar"],
    ["--primary-foreground", "--primary"],
    ["--sidebar-primary-foreground", "--sidebar-primary"],
    ["--destructive", "--background"],
    ["--destructive", "--panel"],
    ["--destructive", "--popover"],
    ["--iris", "--background"],
    ["--iris", "--card"],
    ["--iris", "--popover"],
    ["--iris-strong", "--background"],
    ["--iris-strong", "--card"],
  ])("%s on %s is AA text (≥ 4.5:1)", (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  test("accent-foreground holds AA on the hover wash over the panel", () => {
    expect(
      on("--accent-foreground", "--accent", "--panel"),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test("iris active text holds AA on the iris tint over the panel", () => {
    expect(
      on("--iris-strong", "--iris-muted", "--panel"),
    ).toBeGreaterThanOrEqual(4.5)
  })

  test("sidebar-accent-foreground holds AA on the composited hover wash", () => {
    const sidebar = toRgb(dark["--sidebar"])
    const hover = toRgb(dark["--sidebar-accent"], sidebar)
    expect(
      contrast(toRgb(dark["--sidebar-accent-foreground"]), hover),
    ).toBeGreaterThanOrEqual(4.5)
  })
})

describe("light AA contrast", () => {
  const on = (fg: string, bg: string, base?: string) =>
    pairContrast(root, fg, bg, base)

  test.each([
    ["--foreground", "--background"],
    ["--foreground", "--panel"],
    ["--card-foreground", "--card"],
    ["--popover-foreground", "--popover"],
    ["--muted-foreground", "--panel"],
    ["--muted-foreground", "--background"],
    ["--primary-foreground", "--primary"],
    ["--destructive", "--panel"],
    ["--iris-strong", "--panel"],
    ["--iris-strong", "--background"],
  ])("%s on %s is AA text (≥ 4.5:1)", (fg, bg) => {
    expect(on(fg, bg)).toBeGreaterThanOrEqual(4.5)
  })

  test("iris active text holds AA on the iris tint over the panel", () => {
    expect(
      on("--iris-strong", "--iris-muted", "--panel"),
    ).toBeGreaterThanOrEqual(4.5)
  })
})
