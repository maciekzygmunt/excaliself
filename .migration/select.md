# select

2026-07-21, transformation engine. Content → Portal > Positioner > Popup,
Viewport → List, ScrollButtons → ScrollArrows. Clean.

## Changed

- `src/components/ui/select.tsx` — `Select` is a bare re-export of
  `SelectPrimitive.Root` (Root.Props is generic; the wrapper-function
  pattern can't express it — Root renders no element, so only the
  `data-slot="select"` attr is lost). Radix `position="popper"|
  "item-aligned"` → `alignItemWithTrigger` (default true) exposed from
  Positioner along with side/sideOffset/align/alignOffset. Trigger keeps
  the size variants; Icon uses the children form (its `render` form leaks
  Base UI's default "▼" text child in 1.6.0). Item keeps `focus:` classes
  and adds `data-highlighted:` equivalents; indicator moves into
  `ItemIndicator render={<span/>}`. Scroll arrows renamed with
  `top-0/bottom-0 z-10 w-full bg-popover` positioning.
- `src/routes/_app/settings/-components/MembersSection.tsx` — the role
  Select passes `items={ROLE_LABELS}` (Base UI's Value renders the raw
  value string unless items provides labels).
- `MembersSection.test.tsx` — option clicks use the full
  pointerdown+pointerup+click sequence (Base UI commits selection on
  release, verified empirically); comment updated.

Leftover scan clean.

## Left alone

- `field.tsx` `has-data-[state=checked]:` selectors — not Radix-driven
  (no checkbox in the project); dead on both sides of the migration.

## Behavior changes

- `onValueChange` widens to `(value: Value | null, eventDetails)`; the
  existing `(role) => onChange(role as Role)` handler is unaffected.
- Scroll arrows don't render on touch input (Base UI behavior).

## Verify by hand

- Members page role select: closed trigger shows "Member"/"Admin" labels,
  opening aligns the selected item over the trigger, keyboard typeahead
  ("a" → Admin) works, picking commits and closes.
