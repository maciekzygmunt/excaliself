/**
 * Shown on every app page of the demo, which deletes its data regularly.
 * Bottom center sits clear of Excalidraw's controls; on mobile, above its
 * bottom bar.
 */
export function DemoBanner() {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3 max-md:bottom-24">
      <p
        role="note"
        className="pointer-events-auto rounded-full border bg-background/90 px-3 py-1 text-xs text-muted-foreground shadow-xs backdrop-blur-sm"
      >
        <span className="font-medium text-foreground">Demo</span>
        {" · "}We delete demo accounts and drawings regularly.
      </p>
    </div>
  )
}
