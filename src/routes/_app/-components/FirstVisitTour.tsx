import { Popover } from "@base-ui/react/popover"
import { useMatchRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import { useIsApplePlatform } from "@/hooks/use-is-apple-platform"

type Step = {
  /** CSS selector of the element the step points at. */
  target: string
  title: string
  body: (keys: { palette: string }) => string
}

export const TOUR_STEPS: Step[] = [
  {
    target: '[data-tour="new-drawing"]',
    title: "Make a drawing",
    body: () => "Start a new drawing here, or press N anywhere in the app.",
  },
  {
    target: '[data-tour="folders"]',
    title: "Folders",
    body: () =>
      "Your folders and drawings live here. Drag a drawing onto a folder to move it, or use + to make a folder.",
  },
  {
    target: '[data-tour="command-palette"]',
    title: "Command palette",
    body: ({ palette }) =>
      `Press ${palette} to open any drawing or folder, or to run a command, without the mouse.`,
  },
  {
    target: '[data-slot="sidebar"] a[href^="/drawings"]',
    title: "Search",
    body: () =>
      "All drawings searches the names of your drawings and the text inside them.",
  },
  {
    // Home's New drawing button: a first visit may have no drawings yet.
    target: '[data-tour="share"]',
    title: "Share links",
    body: () =>
      "Every drawing has a Share button. Send the link to draw together, live: members of this instance can join, or anyone with the link if you allow it.",
  },
]

const doneKey = (userId: string) => `excaliself:tour-done:${userId}`
const isDone = (userId: string) => localStorage.getItem(doneKey(userId))
const markDone = (userId: string) => localStorage.setItem(doneKey(userId), "1")

/**
 * A short first-visit tour. Starts on Home, on desktop, once per account in
 * this browser. A step whose element is not on the page is skipped.
 */
export function FirstVisitTour({ userId }: { userId: string }) {
  const [step, setStep] = useState<number | null>(null)
  const [anchor, setAnchor] = useState<Element | null>(null)
  const { isMobile, state } = useSidebar()
  const onHome = useMatchRoute()({ to: "/draw" })
  const isApple = useIsApplePlatform()

  useEffect(() => {
    if (step !== null || !onHome || isMobile || state !== "expanded") return
    if (!isDone(userId)) setStep(0)
  }, [step, onHome, isMobile, state, userId])

  useEffect(() => {
    if (step === null) return
    if (step === TOUR_STEPS.length) return markDone(userId)
    const element = document.querySelector(TOUR_STEPS[step].target)
    if (element) setAnchor(element)
    else setStep(step + 1)
  }, [step, userId])

  const finish = () => setStep(TOUR_STEPS.length)

  if (step === null || step === TOUR_STEPS.length || !anchor) return null
  const { title, body } = TOUR_STEPS[step]
  const last = step === TOUR_STEPS.length - 1

  return (
    <Popover.Root
      open
      // Only Escape skips: a click elsewhere is likely the member trying
      // what the step shows.
      onOpenChange={(open, details) => {
        if (!open && details.reason === "escape-key") finish()
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side="right"
          align="start"
          sideOffset={12}
          collisionPadding={12}
          className="isolate z-50 outline-none"
        >
          <Popover.Popup className="w-72 origin-(--transform-origin) rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-popover outline-none data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 motion-reduce:animate-none">
            <Popover.Arrow className="size-2.5 rotate-45 border-border bg-popover data-[side=bottom]:-top-[5.5px] data-[side=bottom]:border-t data-[side=bottom]:border-l data-[side=left]:-right-[5.5px] data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:-left-[5.5px] data-[side=right]:border-b data-[side=right]:border-l data-[side=top]:-bottom-[5.5px] data-[side=top]:border-r data-[side=top]:border-b" />
            <Popover.Title className="text-sm font-medium">
              {title}
            </Popover.Title>
            <Popover.Description className="mt-1 text-xs text-muted-foreground">
              {body({ palette: isApple ? "⌘K" : "Ctrl+K" })}
            </Popover.Description>
            <div className="mt-4 flex items-center gap-2">
              <span className="flex-1 font-mono text-[10px] tabular-nums text-muted-foreground/70">
                {step + 1} of {TOUR_STEPS.length}
              </span>
              {!last && (
                <Button variant="ghost" size="sm" onClick={finish}>
                  Skip tour
                </Button>
              )}
              <Button
                size="sm"
                onClick={() => (last ? finish() : setStep(step + 1))}
              >
                {last ? "Done" : "Next"}
              </Button>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
