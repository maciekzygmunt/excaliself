# avatar

2026-07-21, transformation engine. Direct part mapping (Root/Image/
Fallback identical). Clean.

## Changed

- `src/components/ui/avatar.tsx` — imports moved to
  `@base-ui/react/avatar`; prop types to `AvatarPrimitive.<Part>.Props`.
  Classes unchanged.

Leftover scan clean.

## Left alone

- `initials-avatar.tsx` — plain span, never Radix.

## Behavior changes

None. (`Fallback delayMs` → `delay` rename would matter only at call
sites; none exist.)

## Verify by hand

- A member row avatar with a broken image URL falls back to initials.
