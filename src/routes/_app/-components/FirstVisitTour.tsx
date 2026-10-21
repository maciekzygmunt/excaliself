import { Popover } from "@base-ui/react/popover"
import { useMatchRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { useIsApplePlatform } from "@/hooks/use-is-apple-platform"
import { useActiveSpace } from "./ActiveSpace"

type Step = {
  id: "spaces" | "search" | "new-drawing" | "share"
  /** Home steps point into the sidebar; the Share step waits for a drawing. */
  home: boolean
  title: string
  body: (keys: { palette: string }) => string
  /** Label of a main button that clicks the target, in place of Next. */
  tryLabel?: string
  side: "right" | "bottom"
}

export const TOUR_STEPS: Step[] = [
  {
    id: "spaces",
    home: true,
    title: "Private and Team",
    body: () =>
      "Private drawings are only yours. Team drawings are shared with every member, and edits show up live.",
    side: "right",
  },
  {
    id: "search",
    home: true,
    title: "Find anything",
    body: ({ palette }) =>
      `Search drawing names and the text inside them, or run a command. Press ${palette} from anywhere.`,
    side: "right",
  },
  {
    id: "new-drawing",
    home: true,
    title: "Make a drawing",
    body: () =>
      "Start one here, or press N from anywhere. The last tip is inside the drawing.",
    tryLabel: "Make a drawing",
    side: "right",
  },
  {
    id: "share",
    home: false,
    title: "Draw together",
    body: () =>
      "Share sends a link to draw together, live. Members of this instance can join, and guests too if you allow it.",
    side: "bottom",
  },
]

type Progress = Step["id"] | "done"

const storageKey = (userId: string) => `excaliself:tour:${userId}`

/**
 * The first-visit tour: three steps on Home, then the Share button in the
 * first drawing the member opens. Progress is kept per account in this
 * browser, so a reload resumes it.
 */
export function FirstVisitTour({ userId }: { userId: string }) {
  const [progress, setProgress] = useState<Progress | null>(null)
  const { isMobile, state } = useSidebar()
  const onHome = Boolean(useMatchRoute()({ to: "/draw" }))
  const { activeSpace } = useActiveSpace()
  const isApple = useIsApplePlatform()
  const primaryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const saved = localStorage.getItem(storageKey(userId)) as Progress | null
    setProgress(saved ?? "spaces")
  }, [userId])

  // With Team hidden there is only one space to explain.
  const steps = activeSpace
    ? TOUR_STEPS
    : TOUR_STEPS.filter((s) => s.id !== "spaces")
  const index = Math.max(
    0,
    steps.findIndex((s) => s.id === progress),
  )
  const step = progress && progress !== "done" ? steps[index] : null
  const visible =
    step !== null &&
    !isMobile &&
    (!step.home || (onHome && state === "expanded"))
  const target = useTourTarget(visible ? `[data-tour="${step.id}"]` : null)

  const save = (next: Progress) => {
    localStorage.setItem(storageKey(userId), next)
    setProgress(next)
  }
  const advance = () => save(steps[index + 1]?.id ?? "done")

  // Using the highlighted control counts as Next.
  useEffect(() => {
    const element = target?.element
    if (!element) return
    element.addEventListener("click", advance)
    return () => element.removeEventListener("click", advance)
  })

  if (!step || !target) return null
  const last = index === steps.length - 1

  return (
    <Popover.Root
      open
      onOpenChange={(_open, details) => {
        if (details.reason === "escape-key") save("done")
      }}
    >
      <Popover.Portal>
        <Spotlight rect={target.rect} />
        <Popover.Positioner
          anchor={target.element}
          side={step.side}
          align={step.side === "right" ? "start" : "end"}
          sideOffset={14}
          collisionPadding={12}
          className="isolate z-50 outline-none"
        >
          <Popover.Popup
            initialFocus={primaryRef}
            className="w-72 origin-(--transform-origin) rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-popover outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 motion-reduce:animate-none"
          >
            <Popover.Arrow className="size-2.5 rotate-45 border-border bg-popover data-[side=bottom]:-top-[5.5px] data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=right]:-left-[5.5px] data-[side=right]:border-b data-[side=right]:border-l" />
            <div className="flex items-baseline justify-between gap-3">
              <Popover.Title className="text-sm font-medium">
                {step.title}
              </Popover.Title>
              <span className="font-mono text-[10px] whitespace-nowrap tabular-nums text-muted-foreground/70">
                {index + 1} of {steps.length}
              </span>
            </div>
            <Popover.Description className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {step.body({ palette: isApple ? "⌘K" : "Ctrl+K" })}
            </Popover.Description>
            <div className="mt-4 flex items-center justify-between">
              {/* -ml-3 lines the ghost label up with the text above. */}
              {!last && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="-ml-3 text-muted-foreground"
                  onClick={() => save("done")}
                >
                  Skip tour
                </Button>
              )}
              <Button
                ref={primaryRef}
                size="sm"
                className="ml-auto"
                onClick={() =>
                  step.tryLabel
                    ? (target.element as HTMLElement).click()
                    : advance()
                }
              >
                {step.tryLabel ?? (last ? "Done" : "Next")}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

type Target = { element: Element; rect: DOMRect }

const sameRect = (a: DOMRect, b: DOMRect) =>
  a.top === b.top &&
  a.left === b.left &&
  a.width === b.width &&
  a.height === b.height

/**
 * The element `selector` names, read every frame: it can load late, move, or
 * hide. A dialog on top pauses the tour.
 */
function useTourTarget(selector: string | null) {
  const [target, setTarget] = useState<Target | null>(null)

  useEffect(() => {
    if (!selector) return setTarget(null)
    let frame = 0
    const read = () => {
      const element = document.querySelector(selector)
      const rect = element?.getBoundingClientRect()
      const covered = document.querySelector('[data-slot="dialog-content"]')
      setTarget((prev) => {
        if (!element || !rect?.width || covered) return null
        if (prev?.element === element && sameRect(prev.rect, rect)) return prev
        return { element, rect }
      })
      frame = requestAnimationFrame(read)
    }
    read()
    return () => cancelAnimationFrame(frame)
  }, [selector])

  return target
}

const PADDING = 4

/** Dims the page and blocks clicks on it, except through a hole at `rect`. */
function Spotlight({ rect }: { rect: DOMRect }) {
  const top = rect.top - PADDING
  const left = rect.left - PADDING
  const bottom = rect.bottom + PADDING
  const right = rect.right + PADDING

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-50">
      <div
        className="absolute rounded-lg transition-[top,left,width,height] duration-200 ease-out motion-reduce:transition-none"
        style={{
          top,
          left,
          width: right - left,
          height: bottom - top,
          boxShadow: "0 0 0 2px var(--iris), 0 0 0 100vmax rgb(0 0 0 / 0.55)",
        }}
      />
      {/* Click shields on the four sides of the hole. */}
      <div
        className="pointer-events-auto absolute inset-x-0 top-0"
        style={{ height: top }}
      />
      <div
        className="pointer-events-auto absolute inset-x-0 bottom-0"
        style={{ top: bottom }}
      />
      <div
        className="pointer-events-auto absolute left-0"
        style={{ top, height: bottom - top, width: left }}
      />
      <div
        className="pointer-events-auto absolute right-0"
        style={{ top, height: bottom - top, left: right }}
      />
    </div>
  )
}
