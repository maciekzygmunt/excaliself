# tooltip

2026-07-21, transformation engine. Content → Portal > Positioner > Popup;
user classes kept with mechanical data-attr rewrites. Clean.

## Changed

- `src/components/ui/tooltip.tsx` — Provider `delayDuration` → `delay`
  (custom 0 default kept). `TooltipContent` exposes
  side/sideOffset/align/alignOffset (declared → destructured → forwarded
  to Positioner, `isolate z-50`). Classes: `data-[state=closed]:` →
  `data-closed:`, `origin-(--radix-tooltip-content-transform-origin)` →
  `origin-(--transform-origin)`. Arrow keeps the rotated-square look and
  gains explicit per-side offset classes (Base UI no longer auto-places
  the arrow).
- `src/components/ui/sidebar.tsx` — `TooltipProvider delayDuration={0}` →
  `delay={0}`; `TooltipTrigger asChild` → `render` (later folded into the
  sidebar useRender migration).
- `src/routes/_app/settings/-components/MembersSection.tsx` — the
  focusable `<span>` wrapper moves into `TooltipTrigger render={…}`
  (Tooltip.Trigger has no `nativeButton` prop in 1.6.0).

Leftover scan clean.

## Left alone

None.

## Behavior changes

- Escape/outside-press interception now runs through `onOpenChange`
  eventDetails (no per-event props); no app code used them.

## Verify by hand

- Collapse the sidebar: menu tooltips appear instantly (delay 0) to the
  right, arrow attached on the correct side.
- Hover the last-admin role select: "The last admin can't be demoted."
