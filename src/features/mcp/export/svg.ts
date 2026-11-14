// A drawing as a standalone SVG, the way Excalidraw's own "Export image"
// writes it: a port of its scene/export.ts and renderer/staticSvgScene.ts
// (MIT) that builds a string instead of DOM nodes, so it runs on the server.
// Bound text on arrows uses its stored position, frame names are not
// truncated, embeds draw as their placeholder, and dark mode is one filter
// on the whole image, where Excalidraw recolors each element.

import { getStroke } from "perfect-freehand"
import type { Drawable } from "roughjs/bin/core"
import { type Element, readElement } from "./elements"
import {
  type FontTarget,
  fontFaces,
  fontFamilyString,
  fontFilesFor,
  HELVETICA,
  verticalOffset,
} from "./fonts"
import { laserOutline } from "./laser"
import {
  absoluteCoords,
  type Bounds,
  elementBounds,
  generateShape,
  generator,
  getCornerRadius,
  isPathALoop,
} from "./shape"
import { stickyNoteFooter, stickyNotePath } from "./sticky-note"

export type ExportOptions = {
  darkMode: boolean
  /** Fill the canvas color behind the drawing. */
  background: boolean
  /** The canvas color, from the drawing's appState. */
  backgroundColor: string
  /** Space around the drawing, in scene pixels. */
  padding: number
  /** Multiplies the SVG's width and height; the viewBox stays. */
  scale: number
  /**
   * "svg" embeds the fonts. "png" leaves them out and names them as the
   * rasterizer knows them; it gets the files in `fontFiles`.
   */
  target: FontTarget
}

/** An image element's file, by its fileId. */
export type ExportFile = { mimeType: string; dataURL: string }

const THEME_FILTER = "invert(93%) hue-rotate(180deg)"
const IMAGE_INVERT_FILTER = "invert(100%) hue-rotate(180deg) saturate(1.25)"
const FRAME_STYLE = {
  strokeColor: "#bbb",
  strokeWidth: 2,
  radius: 8,
  nameOffsetY: 3,
  nameColorLightTheme: "#999999",
  nameColorDarkTheme: "#7a7a7a",
  nameFontSize: 14,
  nameLineHeight: 1.25,
}
// The room Excalidraw leaves around a label (BOUND_TEXT_PADDING).
const BOUND_TEXT_PADDING = 5
const STICKY_NOTE_FOOTER_FONT = "Helvetica, Arial, sans-serif"
const FRAME_TYPES = new Set(["frame", "magicframe"])
const IFRAME_TYPES = new Set(["iframe", "embeddable"])
const DRAWN_TYPES = new Set([
  "rectangle",
  "diamond",
  "ellipse",
  "stickynote",
  "line",
  "arrow",
  "freedraw",
  "text",
  "image",
  "frame",
  "magicframe",
  "iframe",
  "embeddable",
])

const RS_LTR_CHARS = "A-Za-zÀ-ÖØ-öø-ʸ̀-֐ࠀ-῿" + "Ⰰ-﬜﷾-﹯﻽-￿"
const RS_RTL_CHARS = "֑-߿יִ-﷽ﹰ-ﻼ"
const RE_RTL_CHECK = new RegExp(`^[^${RS_LTR_CHARS}]*[${RS_RTL_CHARS}]`)

const escapeXml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")

type Attrs = Record<string, string | number | undefined>

const attrs = (values: Attrs) =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeXml(String(value))}"`)
    .join("")

const tag = (name: string, values: Attrs, children = "") =>
  `<${name}${attrs(values)}>${children}</${name}>`

/** rough.js's RoughSVG.draw, as a string, with Excalidraw's 2 decimals. */
function drawable(shape: Drawable, values: Attrs, extra = "") {
  const o = { ...shape.options, fixedDecimalPlaceDigits: 2 }
  const paths = shape.sets.map((set) => {
    const d = generator.opsToPath(set, o.fixedDecimalPlaceDigits)
    switch (set.type) {
      case "path":
        return tag("path", {
          d,
          stroke: o.stroke,
          "stroke-width": o.strokeWidth,
          fill: "none",
          "stroke-dasharray": o.strokeLineDash?.join(" ").trim(),
          "stroke-dashoffset": o.strokeLineDashOffset || undefined,
        })
      case "fillPath":
        return tag("path", {
          d,
          stroke: "none",
          "stroke-width": 0,
          fill: o.fill || "",
          "fill-rule":
            shape.shape === "curve" || shape.shape === "polygon"
              ? "evenodd"
              : undefined,
        })
      case "fillSketch":
        return tag("path", {
          d,
          stroke: o.fill || "",
          "stroke-width": o.fillWeight < 0 ? o.strokeWidth / 2 : o.fillWeight,
          fill: "none",
          "stroke-dasharray": o.fillLineDash?.join(" ").trim(),
          "stroke-dashoffset": o.fillLineDashOffset || undefined,
        })
      default:
        return ""
    }
  })
  return tag("g", values, paths.join("") + extra)
}

// Trims path numbers to two decimals, like Excalidraw.
const TO_FIXED_PRECISION = /(\s?[A-Z]?,?-?[0-9]*\.[0-9]{0,2})(([0-9]|e|-)*)/g

/** The outline of a freedraw stroke, around its points. */
function freeDrawOutline(element: Element): number[][] {
  const { streamline, variability } = element.strokeOptions
  if (variability === "constant")
    return laserOutline(element.points, element.strokeWidth * 1.4, streamline)
  const input = element.simulatePressure
    ? element.points.map(([x, y]) => [x, y])
    : element.points.length
      ? element.points.map(([x, y], i) => [x, y, element.pressures[i] ?? 0.5])
      : [[0, 0, 0.5]]
  return getStroke(input, {
    simulatePressure: element.simulatePressure,
    size: element.strokeWidth * 4.25,
    thinning: 0.6,
    smoothing: 0.5,
    streamline,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    last: true,
  })
}

function freeDrawPath(element: Element) {
  const points = freeDrawOutline(element)
  if (!points.length) return ""
  const med = (a: number[], b: number[]) => [
    (a[0] + b[0]) / 2,
    (a[1] + b[1]) / 2,
  ]
  const max = points.length - 1
  return points
    .reduce<(string | number[])[]>(
      (acc, point, i, arr) => {
        if (i === max) acc.push(point, med(point, arr[0]), "L", arr[0], "Z")
        else acc.push(point, med(point, arr[i + 1]))
        return acc
      },
      ["M", points[0], "Q"],
    )
    .join(" ")
    .replace(TO_FIXED_PRECISION, "$1")
}

/** Only web and mail links become anchors. */
const safeLink = (link: string | null) =>
  link && /^(https?:|mailto:)/i.test(link.trim()) ? link.trim() : null

const frameName = (frame: Element) =>
  frame.name ?? (frame.type === "frame" ? "Frame" : "AI Frame")

/** Frame names are drawn as text above their frames, like Excalidraw does. */
function frameLabel(frame: Element, darkMode: boolean): Element {
  const height = FRAME_STYLE.nameFontSize * FRAME_STYLE.nameLineHeight
  const text = frameName(frame)
  return readElement({
    id: `${frame.id}-name`,
    type: "text",
    x: frame.x,
    y: frame.y - FRAME_STYLE.nameOffsetY - height,
    width: frame.width,
    height,
    text,
    originalText: text,
    fontFamily: 2,
    fontSize: FRAME_STYLE.nameFontSize,
    lineHeight: FRAME_STYLE.nameLineHeight,
    strokeColor: darkMode
      ? FRAME_STYLE.nameColorDarkTheme
      : FRAME_STYLE.nameColorLightTheme,
  })
}

/** The text Excalidraw puts in an embed's placeholder. */
function embedLabel(element: Element): Element {
  const text =
    element.type === "iframe"
      ? "IFrame element"
      : element.link || "Empty Web-Embed"
  const fontSize = Math.max(
    Math.min(element.width / 2, element.width / text.length),
    element.width / 30,
  )
  const height = fontSize * 1.15
  return readElement({
    id: `${element.id}-label`,
    type: "text",
    x: element.x,
    y: element.y + element.height / 2 - height / 2,
    width: element.width,
    height,
    angle: element.angle,
    text,
    originalText: text,
    fontFamily: 2,
    fontSize,
    lineHeight: 1.15,
    textAlign: "center",
    strokeColor:
      element.strokeColor !== "transparent" ? element.strokeColor : "black",
  })
}

type Scene = {
  byId: Map<string, Element>
  shapes: Map<Element, Drawable[]>
  files: Map<string, ExportFile>
  options: ExportOptions
  offsetX: number
  offsetY: number
  /** Image symbols and masks, collected into <defs>. */
  defs: string[]
  symbols: Set<string>
}

const shapeOf = (scene: Scene, element: Element) => {
  let shape = scene.shapes.get(element)
  if (!shape) {
    shape = generateShape(element, scene.options.backgroundColor)
    scene.shapes.set(element, shape)
  }
  return shape
}

function renderElement(scene: Scene, element: Element): string {
  const { byId } = scene
  const offsetX = element.x + scene.offsetX
  const offsetY = element.y + scene.offsetY
  const shape = shapeOf(scene, element)
  // An arrow's label turns around the arrow's center, not its own.
  const container =
    element.type === "text" && element.containerId
      ? byId.get(element.containerId)
      : undefined
  const { x1, y1, x2, y2 } =
    container?.type === "arrow"
      ? absoluteCoords(container, shapeOf(scene, container))
      : absoluteCoords(element, shape)
  const cx = (x2 - x1) / 2 - (element.x - x1)
  const cy = (y2 - y1) / 2 - (element.y - y1)
  const degree = (180 * element.angle) / Math.PI
  const transform = `translate(${offsetX} ${offsetY}) rotate(${degree} ${cx} ${cy})`
  const frame = element.frameId ? byId.get(element.frameId) : undefined
  const containingFrame =
    frame && FRAME_TYPES.has(frame.type) ? frame : undefined
  const opacity = ((containingFrame?.opacity ?? 100) * element.opacity) / 10000
  const opacityAttrs =
    opacity !== 1 ? { "stroke-opacity": opacity, "fill-opacity": opacity } : {}

  // Frame children are clipped to their frame, as on the canvas. Arrows and
  // their labels are not, so they can leave the frame.
  const clipped = (node: string) =>
    containingFrame && element.type !== "arrow" && container?.type !== "arrow"
      ? tag("g", { "clip-path": `url(#clip-${containingFrame.id})` }, node)
      : node

  let node = ""
  switch (element.type) {
    case "rectangle":
    case "diamond":
    case "ellipse":
      node = clipped(
        drawable(shape[0], {
          ...opacityAttrs,
          "stroke-linecap": "round",
          transform,
        }),
      )
      break
    case "stickynote": {
      const paper = stickyNotePath(element)
      const clipId = `sticky-note-clipPath-${element.id}`
      scene.defs.push(
        tag(
          "clipPath",
          { id: clipId, clipPathUnits: "userSpaceOnUse" },
          tag("path", { d: paper, fill: "#000", stroke: "none" }),
        ),
      )
      // The dark mode filter turns white into the near-black a shadow needs.
      const shadow = scene.options.darkMode ? "#fff" : "#000"
      const footer = stickyNoteFooter(element)
      node = clipped(
        tag(
          "g",
          { transform, opacity: opacity !== 1 ? opacity : undefined },
          tag("path", {
            d: stickyNotePath(element, true),
            fill: shadow,
            "fill-opacity": 0.16,
            stroke: "none",
          }) +
            tag("path", {
              d: paper,
              fill: element.backgroundColor,
              stroke: "none",
            }) +
            // A thin shadow along the paper's edge, on its inside.
            tag("path", {
              d: paper,
              fill: "none",
              stroke: shadow,
              "stroke-opacity": 0.08,
              "stroke-width": 1,
              "clip-path": `url(#${clipId})`,
            }) +
            (footer
              ? tag(
                  "text",
                  {
                    x: footer.x,
                    y: footer.y,
                    "font-family":
                      scene.options.target === "svg"
                        ? STICKY_NOTE_FOOTER_FONT
                        : fontFamilyString(HELVETICA, "png"),
                    "font-size": "12px",
                    "text-anchor": "end",
                    direction: "ltr",
                    fill: element.strokeColor,
                    "fill-opacity": 1,
                  },
                  escapeXml(footer.text),
                )
              : ""),
        ),
      )
      break
    }
    case "iframe":
    case "embeddable":
      node = clipped(
        drawable(shape[0], {
          ...opacityAttrs,
          "stroke-linecap": "round",
          transform,
        }) + renderElement(scene, embedLabel(element)),
      )
      break
    case "line":
    case "arrow": {
      const boundText = element.boundTextId
        ? byId.get(element.boundTextId)
        : undefined
      let mask = ""
      if (boundText) {
        // Cuts the line where its label sits. In user space: the default
        // units give a straight arrow's mask no area, which hides the arrow.
        const width = element.width + 100 + offsetX
        const height = element.height + 100 + offsetY
        mask = tag(
          "mask",
          {
            id: `mask-${element.id}`,
            maskUnits: "userSpaceOnUse",
            x: 0,
            y: 0,
            width,
            height,
          },
          tag("rect", { x: 0, y: 0, fill: "#fff", width, height }) +
            tag("rect", {
              x: scene.offsetX + boundText.x - BOUND_TEXT_PADDING,
              y: scene.offsetY + boundText.y - BOUND_TEXT_PADDING,
              fill: "#000",
              width: boundText.width + BOUND_TEXT_PADDING * 2,
              height: boundText.height + BOUND_TEXT_PADDING * 2,
              opacity: 1,
            }),
        )
      }
      const loopFill =
        element.type === "line" &&
        isPathALoop(element.points) &&
        element.backgroundColor !== "transparent"
      const group = tag(
        "g",
        {
          mask: boundText ? `url(#mask-${element.id})` : undefined,
          "stroke-linecap": "round",
        },
        shape
          .map((part) =>
            drawable(part, {
              ...opacityAttrs,
              transform,
              "fill-rule": loopFill ? "evenodd" : undefined,
            }),
          )
          .join(""),
      )
      node = clipped(group + mask)
      break
    }
    case "freedraw": {
      const path = tag("path", {
        fill: element.strokeColor,
        d: freeDrawPath(element),
      })
      const values = { ...opacityAttrs, transform, stroke: "none" }
      node = clipped(
        shape[0] ? drawable(shape[0], values, path) : tag("g", values, path),
      )
      break
    }
    case "image":
      node = renderImage(scene, element, {
        cx,
        cy,
        degree,
        opacity,
        offsetX,
        offsetY,
      })
      node = node && clipped(node)
      break
    case "frame":
    case "magicframe":
      node = tag("rect", {
        transform,
        width: `${element.width}px`,
        height: `${element.height}px`,
        rx: FRAME_STYLE.radius,
        ry: FRAME_STYLE.radius,
        fill: "none",
        stroke: FRAME_STYLE.strokeColor,
        "stroke-width": FRAME_STYLE.strokeWidth,
      })
      break
    case "text": {
      const lines = element.text.replace(/\r\n?/g, "\n").split("\n")
      const lineHeightPx = element.fontSize * element.lineHeight
      const horizontalOffset =
        element.textAlign === "center"
          ? element.width / 2
          : element.textAlign === "right"
            ? element.width
            : 0
      const baseline = verticalOffset(
        element.fontFamily,
        element.fontSize,
        lineHeightPx,
      )
      const direction = RE_RTL_CHECK.test(element.text) ? "rtl" : "ltr"
      const textAnchor =
        element.textAlign === "center"
          ? "middle"
          : element.textAlign === "right" || direction === "rtl"
            ? "end"
            : "start"
      const texts = lines.map((line, i) =>
        tag(
          "text",
          {
            x: horizontalOffset,
            y: i * lineHeightPx + baseline,
            "font-family": fontFamilyString(
              element.fontFamily,
              scene.options.target,
            ),
            "font-size": `${element.fontSize}px`,
            fill: element.strokeColor,
            "text-anchor": textAnchor,
            style: "white-space: pre;",
            direction,
            "dominant-baseline": "alphabetic",
          },
          escapeXml(line),
        ),
      )
      node = clipped(tag("g", { ...opacityAttrs, transform }, texts.join("")))
      break
    }
  }

  const link = safeLink(element.link)
  return link && node ? tag("a", { href: link }, node) : node
}

function renderImage(
  scene: Scene,
  element: Element,
  at: {
    cx: number
    cy: number
    degree: number
    opacity: number
    offsetX: number
    offsetY: number
  },
) {
  const file = element.fileId ? scene.files.get(element.fileId) : undefined
  if (!file || !element.fileId) return ""
  const width = Math.round(element.width)
  const height = Math.round(element.height)
  const { crop } = element
  const uncroppedWidth = crop
    ? element.width / (crop.width / crop.naturalWidth)
    : element.width
  const uncroppedHeight = crop
    ? element.height / (crop.height / crop.naturalHeight)
    : element.height
  const symbolId = crop ? `image-crop-${element.id}` : `image-${element.fileId}`

  if (!scene.symbols.has(symbolId)) {
    scene.symbols.add(symbolId)
    scene.defs.unshift(
      tag(
        "symbol",
        { id: symbolId },
        tag("image", {
          href: file.dataURL,
          preserveAspectRatio: "none",
          width: crop ? uncroppedWidth : "100%",
          height: crop ? uncroppedHeight : "100%",
        }),
      ),
    )
  }

  const cropX = crop ? crop.x / (crop.naturalWidth / uncroppedWidth) : 0
  const cropY = crop ? crop.y / (crop.naturalHeight / uncroppedHeight) : 0
  const centerX = at.cx + cropX
  const centerY = at.cy + cropY
  const [scaleX, scaleY] = element.scale
  const use = tag("use", {
    href: `#${symbolId}`,
    // In dark mode, the root's invert filter is undone for raster images.
    filter:
      scene.options.darkMode && file.mimeType !== "image/svg+xml"
        ? IMAGE_INVERT_FILTER
        : undefined,
    width: width + cropX,
    height: height + cropY,
    opacity: at.opacity,
    transform:
      scaleX !== 1 || scaleY !== 1
        ? `translate(${centerX} ${centerY}) scale(${scaleX} ${scaleY}) translate(${-centerX} ${-centerY})`
        : undefined,
  })

  let maskId: string | undefined
  if (crop) {
    maskId = `mask-image-crop-${element.id}`
    scene.defs.push(
      tag(
        "mask",
        { id: maskId, fill: "#fff" },
        tag("rect", { x: cropX, y: cropY, width, height }),
      ),
    )
  }
  let clipId: string | undefined
  if (element.roundness) {
    clipId = `image-clipPath-${element.id}`
    const radius = getCornerRadius(
      Math.min(element.width, element.height),
      element,
    )
    scene.defs.push(
      tag(
        "clipPath",
        { id: clipId, clipPathUnits: "userSpaceOnUse" },
        tag("rect", {
          // Over the crop's visible part, like the mask.
          x: cropX,
          y: cropY,
          width: element.width,
          height: element.height,
          rx: radius,
          ry: radius,
        }),
      ),
    )
  }
  return tag(
    "g",
    {
      mask: maskId ? `url(#${maskId})` : undefined,
      transform: `translate(${at.offsetX - cropX} ${at.offsetY - cropY}) rotate(${at.degree} ${centerX} ${centerY})`,
      "clip-path": clipId ? `url(#${clipId})` : undefined,
    },
    use,
  )
}

/**
 * The drawing as an SVG document, with its fonts embedded. Null when it has
 * nothing to draw.
 */
export async function renderSvg(
  rawElements: readonly Record<string, unknown>[],
  files: Map<string, ExportFile>,
  options: ExportOptions,
): Promise<{
  svg: string
  width: number
  height: number
  /** For a PNG: the font files its text needs. */
  fontFiles: string[]
} | null> {
  const elements = rawElements
    .filter((element) => !element.isDeleted)
    .map(readElement)
    .filter((element) => DRAWN_TYPES.has(element.type))
  if (elements.length === 0) return null
  const byId = new Map(elements.map((element) => [element.id, element]))

  const forRender = elements.flatMap((element) =>
    FRAME_TYPES.has(element.type)
      ? [frameLabel(element, options.darkMode), element]
      : [element],
  )

  const scene: Scene = {
    byId,
    shapes: new Map(),
    files,
    options,
    offsetX: 0,
    offsetY: 0,
    defs: [],
    symbols: new Set(),
  }

  // A frame's children don't widen the export: the frame clips them.
  const roots = forRender.filter((element) => {
    const frame = element.frameId ? byId.get(element.frameId) : undefined
    return !frame || !FRAME_TYPES.has(frame.type)
  })
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity]
  for (const element of roots) {
    const [x1, y1, x2, y2] = elementBounds(element, shapeOf(scene, element))
    bounds[0] = Math.min(bounds[0], x1)
    bounds[1] = Math.min(bounds[1], y1)
    bounds[2] = Math.max(bounds[2], x2)
    bounds[3] = Math.max(bounds[3], y2)
  }
  const { padding } = options
  const width = bounds[2] - bounds[0] + padding * 2
  const height = bounds[3] - bounds[1] + padding * 2
  scene.offsetX = -bounds[0] + padding
  scene.offsetY = -bounds[1] + padding

  const frameClips = elements
    .filter((element) => FRAME_TYPES.has(element.type))
    .map((frame) =>
      tag(
        "clipPath",
        { id: `clip-${frame.id}` },
        tag("rect", {
          transform: `translate(${frame.x + scene.offsetX} ${frame.y + scene.offsetY}) rotate(${(180 * frame.angle) / Math.PI} ${frame.width / 2} ${frame.height / 2})`,
          width: frame.width,
          height: frame.height,
          rx: FRAME_STYLE.radius,
          ry: FRAME_STYLE.radius,
        }),
      ),
    )

  // Bound text draws right after its container; embeds draw on top.
  const order = [
    ...forRender.filter((element) => !IFRAME_TYPES.has(element.type)),
    ...forRender.filter((element) => IFRAME_TYPES.has(element.type)),
  ]
  const body: string[] = []
  for (const element of order) {
    if (
      element.type === "text" &&
      element.containerId &&
      byId.has(element.containerId)
    )
      continue
    body.push(renderElement(scene, element))
    const boundText = element.boundTextId
      ? byId.get(element.boundTextId)
      : undefined
    if (boundText?.type === "text") body.push(renderElement(scene, boundText))
  }

  const textsByFamily = new Map<number, string>()
  const addText = (fontFamily: number, text: string) =>
    textsByFamily.set(fontFamily, (textsByFamily.get(fontFamily) ?? "") + text)
  for (const element of forRender) {
    const text = IFRAME_TYPES.has(element.type) ? embedLabel(element) : element
    if (text.type === "text") addText(text.fontFamily, text.originalText)
    // A sticky note's date is in Helvetica, which a PNG has a font file for.
    else if (text.type === "stickynote")
      addText(HELVETICA, stickyNoteFooter(text)?.text ?? "")
  }
  const style =
    options.target === "svg"
      ? tag(
          "style",
          { class: "style-fonts" },
          (await fontFaces(textsByFamily))
            .map((face) => `\n      ${face}`)
            .join(""),
        )
      : ""

  const background =
    options.background && options.backgroundColor
      ? tag("rect", {
          x: 0,
          y: 0,
          width,
          height,
          fill: options.backgroundColor,
        })
      : ""

  const svg = tag(
    "svg",
    {
      version: "1.1",
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: `0 0 ${width} ${height}`,
      width: width * options.scale,
      height: height * options.scale,
      filter: options.darkMode ? THEME_FILTER : undefined,
    },
    `<!-- svg-source:excalidraw -->${tag(
      "defs",
      {},
      [...frameClips, style, ...scene.defs].join(""),
    )}${background}${body.join("")}`,
  )
  return {
    svg,
    width: width * options.scale,
    height: height * options.scale,
    fontFiles:
      options.target === "png"
        ? fontFilesFor(textsByFamily, "png").map(({ file }) => file)
        : [],
  }
}
