// Text metrics for scenes built on the server, where there is no canvas to
// measure with. Sums Excalifont advance widths, which ignores kerning and so
// errs a few percent wide: text wraps a little early but never overflows.

import { EXCALIFONT_WIDTHS } from "./excalifont-widths"

export const FONT_SIZE = 20
/** Excalifont's line height, as Excalidraw stores it on text elements. */
export const LINE_HEIGHT = 1.25

const widths = new Map(
  EXCALIFONT_WIDTHS.split(",").map((entry) => {
    const [codePoint, width] = entry.split(":").map(Number)
    return [codePoint, width] as const
  }),
)
// Glyphs Excalifont lacks render in fallback fonts (Xiaolai for CJK, the
// system emoji font), which are about 1em wide.
const FALLBACK_WIDTH = 1000

export function lineWidth(line: string, fontSize: number): number {
  let width = 0
  for (const char of line) {
    width += widths.get(char.codePointAt(0) ?? 0) ?? FALLBACK_WIDTH
  }
  return (width * fontSize) / 1000
}

/** Width of the widest line and height of all lines, as Excalidraw sizes text. */
export function measureText(text: string, fontSize: number) {
  const lines = text.split("\n")
  return {
    width: Math.max(...lines.map((line) => lineWidth(line, fontSize))),
    height: lines.length * fontSize * LINE_HEIGHT,
  }
}

/** Breaks `text` into lines no wider than `maxWidth`: at spaces, or mid-word when one word is too wide. */
export function wrapText(
  text: string,
  fontSize: number,
  maxWidth: number,
): string {
  return text
    .split("\n")
    .flatMap((line) => wrapLine(line, fontSize, maxWidth))
    .join("\n")
}

function wrapLine(line: string, fontSize: number, maxWidth: number): string[] {
  if (lineWidth(line, fontSize) <= maxWidth) return [line]
  const lines: string[] = []
  let current = ""
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word
    if (lineWidth(candidate, fontSize) <= maxWidth) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = ""
    // A word wider than the line is broken by character.
    for (const char of word) {
      if (current && lineWidth(current + char, fontSize) > maxWidth) {
        lines.push(current)
        current = ""
      }
      current += char
    }
  }
  if (current) lines.push(current)
  return lines
}
