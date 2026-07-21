# dialog

2026-07-21, transformation engine. Overlay → Backdrop, Content → Popup
(centered modal, no Positioner). Clean.

## Changed

- `src/components/ui/dialog.tsx` — part renames plus mechanical class
  rewrites `data-[state=open]:` → `data-open:` / `data-[state=closed]:` →
  `data-closed:` (tw-animate-css keyframes still fire; Base UI keeps the
  popup mounted through exit animations). `showCloseButton` custom prop
  kept.

Leftover scan clean.

## Left alone

- Consumers (`CreateDialog`, `type-to-confirm-dialog`, settings dialogs)
  pass only `open`/`onOpenChange`/content parts — no changes needed.
- `CreateDialog.test.tsx` — Escape-dismiss assertion gains the
  `eventDetails` second argument (Base UI callback signature); the
  app-initiated `onOpenChange(false)` assertions stay single-arg.

## Behavior changes

- `onOpenChange` receives `(open, eventDetails)`; existing single-arg
  handlers remain type-safe.
- Radix `onOpenAutoFocus`/`onCloseAutoFocus`/`onInteractOutside` props no
  longer exist (none used on dialogs; the dropdown equivalents were
  migrated separately).

## Verify by hand

- Open the create-drawing dialog: fade+zoom in, Escape closes with exit
  animation, focus returns to the trigger, backdrop click dismisses.
