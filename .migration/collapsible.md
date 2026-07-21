# collapsible

2026-07-21, transformation engine. Content → Panel; custom 150ms height
animation restated in Base UI's transition idiom. Clean.

## Changed

- `src/components/ui/collapsible.tsx` — `CollapsibleContent` renders
  `CollapsiblePrimitive.Panel`. The tw-animate-css keyframes
  (`animate-collapsible-down/up`, driven by
  `--radix-collapsible-content-height`) are replaced by
  `h-(--collapsible-panel-height) transition-[height] duration-150
  data-starting-style:h-0 data-ending-style:h-0 motion-reduce:transition-none`
  — same 150ms feel, same reduced-motion opt-out.
- `src/components/ui/collapsible.test.tsx` — class assertions updated to
  the new animation classes.
- `src/routes/_app/-components/sidebar/FolderItem.tsx` —
  `<CollapsibleTrigger asChild>{row}</CollapsibleTrigger>` →
  `render={row} nativeButton={false}`; `<Collapsible … asChild>{item}` →
  `render={item}`.
- `src/routes/_app/-components/sidebar/TreeRowActions.test.tsx` — trigger
  render prop; `onOpenChange` assertion gains the `eventDetails` second
  argument.
- `src/routes/_app/-components/sidebar/FolderItem.test.tsx` — trigger
  state read from `data-panel-open` (presence) instead of
  `data-state="open"/"closed"`.

Leftover scan clean.

## Left alone

None.

## Behavior changes

- Trigger open-state attribute is `data-panel-open` (no `data-state`);
  panel presence attrs are `data-open`/`data-closed`.

## Verify by hand

- Expand/collapse a sidebar folder: 150ms height ease synced with the
  chevron rotation; with reduced motion enabled it snaps.
