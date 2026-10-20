// The sidebar's Private | Team control, ported 1:1 from prototype variant A:
// a trough with a sliding pill. Each segment is also a drop target, and
// holding a drag over the inactive one spring-loads the switch.

import { useQuery } from "@tanstack/react-query"
import { SPACES } from "@/components/space-label"
import type { Space } from "@/db/schema"
import { liveDrawingsQueryOptions } from "@/features/collab/queries"
import { cn } from "@/lib/utils"
import { useActiveSpace } from "../ActiveSpace"
import { useSpringLoad } from "./space-gestures"
import type { DropTarget } from "./tree"
import { isFileDrag, useSidebarDnD } from "./use-sidebar-dnd"

export function SpaceSegments({ activeSpace }: { activeSpace: Space }) {
  const { data: teamLive = 0 } = useQuery({
    ...liveDrawingsQueryOptions(),
    select: (live) => live.teamCount,
  })

  return (
    <div className="px-2 pb-1">
      <div className="relative grid grid-cols-2 rounded-md bg-well p-0.5 shadow-well">
        <div
          aria-hidden="true"
          className={cn(
            "pointer-events-none absolute top-0.5 bottom-0.5 left-0.5 w-[calc(50%-2px)] rounded-[5px] bg-keycap-from shadow-keycap transition-transform duration-200 ease-out motion-reduce:transition-none",
            activeSpace === "team" && "translate-x-full",
          )}
        />
        <Segment space="private" active={activeSpace === "private"} />
        <Segment
          space="team"
          active={activeSpace === "team"}
          liveCount={teamLive}
        />
      </div>
    </div>
  )
}

function Segment({
  space,
  active,
  liveCount = 0,
}: {
  space: Space
  active: boolean
  liveCount?: number
}) {
  const { setActiveSpace } = useActiveSpace()
  const { dragItem, dropTarget, canDrop, onDragOver, onDragLeave, onDrop } =
    useSidebarDnD()
  const target: DropTarget = { type: "root", space }
  const spring = useSpringLoad(() => setActiveSpace(space))
  const droppable = dragItem !== null && canDrop(dragItem, target)
  const invited = droppable && dragItem.space !== space
  // The drop target is set only for a drop the segment takes.
  const over = dropTarget?.type === "root" && dropTarget.space === space
  const { label, icon: Icon } = SPACES[space]

  return (
    <button
      type="button"
      onClick={() => setActiveSpace(space)}
      aria-pressed={active}
      onDragOver={(e) => {
        onDragOver(target)(e)
        if ((droppable || (!dragItem && isFileDrag(e))) && !active) spring.arm()
      }}
      onDragLeave={() => {
        onDragLeave()
        spring.disarm()
      }}
      onDrop={(e) => {
        spring.disarm()
        onDrop(target)(e)
      }}
      className={cn(
        "relative z-10 flex items-center justify-center gap-1.5 rounded-[5px] py-1 text-[12px] font-medium transition-colors",
        active
          ? "text-foreground"
          : "text-muted-foreground/70 hover:text-muted-foreground",
        invited && !over && "ring-1 ring-iris-ring",
        over && "bg-iris-muted text-iris-strong ring-2 ring-iris-ring",
      )}
    >
      <Icon
        className={cn(
          "h-3 w-3",
          active ? "text-iris" : "text-muted-foreground/50",
        )}
        strokeWidth={2.25}
      />
      {label}
      {liveCount > 0 && (
        <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-live-muted px-1 text-[10px] font-semibold text-live tabular-nums">
          {liveCount}
        </span>
      )}
    </button>
  )
}
