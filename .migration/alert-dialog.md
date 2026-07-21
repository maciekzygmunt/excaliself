# alert-dialog

2026-07-21, transformation engine. Overlay → Backdrop, Content → Popup,
Cancel → Close; Action recomposed on Close. Clean.

## Changed

- `src/components/ui/alert-dialog.tsx` — part renames + `data-open`/
  `data-closed` class rewrites. `AlertDialogCancel` renders
  `AlertDialogPrimitive.Close` (outline button styles). Base UI has no
  Action primitive, so `AlertDialogAction` also composes Close — the
  caller's `onClick` runs, then the dialog closes, matching Radix Action
  semantics. The backdrop keeps the `stopPropagation` click fence (portal
  bubbling comment preserved).
- `src/components/danger-confirm-dialog.tsx` — `trigger` prop narrows
  `ReactNode` → `ReactElement`; `<AlertDialogTrigger asChild>` →
  `render={trigger}`. All existing triggers are real buttons.

Leftover scan clean.

## Left alone

- `type-to-confirm-dialog.tsx` — uses Cancel + a plain Button with
  controlled open; compiles and behaves unchanged.

## Behavior changes

- Initial focus: Radix focused the Cancel button on open; Base UI focuses
  the first tabbable element in the popup. Flagged, not patched (pass
  `initialFocus` on the Popup if the old behavior is wanted).
- Base UI AlertDialog never closes on outside press (Radix alert-dialog
  behaved the same) — no change in practice.

## Verify by hand

- Delete-forever flow in trash: dialog opens, Cancel closes without
  firing, confirm shows the pending label and closes on success; while
  pending, Escape/Cancel are locked by the controlled `open`.
