# separator

2026-07-21, transformation engine. Direct mapping to the callable
`@base-ui/react/separator` primitive. Clean.

## Changed

- `src/components/ui/separator.tsx` — `SeparatorPrimitive.Root` → callable
  `SeparatorPrimitive`; `decorative` prop dropped (no Base UI equivalent —
  the separator is always semantic `role="separator"`). Classes unchanged;
  `data-[orientation=...]` attributes are identical in Base UI.

Leftover scan clean.

## Left alone

No app code passed `decorative`.

## Behavior changes

- Separators are now always exposed as `role="separator"` to assistive
  tech (Radix default was decorative/hidden). Flagged, not patched — Base
  UI has no opt-out.

## Verify by hand

- Sidebar separator renders 1px, both orientations look unchanged.
