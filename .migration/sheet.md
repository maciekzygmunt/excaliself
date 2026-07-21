# sheet

2026-07-21, transformation engine. Built on Base UI Dialog (as the Radix
version was on Radix Dialog). Clean.

## Changed

- `src/components/ui/sheet.tsx` — Overlay → Backdrop, Content → Popup;
  per-side slide classes rewritten mechanically
  (`data-[state=open]:slide-in-from-right` → `data-open:slide-in-from-right`,
  etc.); asymmetric durations kept (`data-open:duration-500
  data-closed:duration-300`).

Leftover scan clean.

## Left alone

- The `data-open:bg-secondary` class on the built-in close button was
  carried over mechanically from the Radix version, where it was equally
  inert (Close never carried open-state attrs).

## Behavior changes

None beyond the dialog family's `onOpenChange` eventDetails argument.

### Post-review fix

The backdrop now animates with a transition
(`data-starting-style`/`data-ending-style` opacity) instead of
animate-in/out keyframes: Base UI keeps the backdrop mounted until the
popup's exit finishes, and a finished exit keyframe reverted to full
opacity for the remaining frames — visible as a backdrop blink on close.

## Verify by hand

- Narrow the window to mobile width, open the sidebar sheet: slides in
  from the correct side, backdrop fades, Escape and backdrop click close
  with the 300ms exit.
