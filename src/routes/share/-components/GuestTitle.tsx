/**
 * The drawing's name in Excalidraw's top-left island, portaled in beside the
 * burger so it lands on the same row, at the same weight, as the title on a
 * member's canvas (spec §1.3). Plain text, not a field: a guest may rename
 * itself but never the drawing.
 */

type Props = { name: string }

export function GuestTitle({ name }: Props) {
  const label = name || "Untitled Drawing"
  return (
    <div className="pointer-events-auto hidden max-w-64 flex-nowrap items-baseline gap-2 lg:flex">
      <span
        className="max-w-45 truncate text-[0.95rem] font-semibold text-(--text-primary-color)"
        title={label}
      >
        {label}
      </span>
      {/* Says what this page is without competing with the drawing's name. */}
      <span className="shrink-0 text-xs text-(--color-gray-60)">Shared</span>
    </div>
  )
}
