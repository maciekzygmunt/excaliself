# project — whole-project Radix → Base UI migration

2026-07-21. Legacy `new-york` style: classification against the radix
registry goldens, then the transformation engine on the project's own
files (classes kept; there is no `base-new-york` to replay onto).

## Dependency swap

- Added `@base-ui/react@1.6.0`.
- Removed direct deps: `radix-ui`, `@radix-ui/react-alert-dialog`,
  `-avatar`, `-collapsible`, `-dialog`, `-dropdown-menu`, `-label`,
  `-separator`, `-slot`, `-tooltip`.
- `@radix-ui/*` packages remaining in `pnpm-lock.yaml` are transitive
  dependencies of `@excalidraw/excalidraw` (it ships Radix popover
  internally) — not removable from this repo.
- `tw-animate-css` stays: its animate-in/out utilities still drive
  popup/dialog animations via Base UI's `data-open`/`data-closed`
  presence attributes.

## Wrappers migrated (12)

button, label, separator, avatar, collapsible, tooltip, dialog,
alert-dialog, sheet, dropdown-menu, select, sidebar — one commit each,
typecheck + relevant tests green per step; per-component reports sit next
to this file.

## Intentionally untouched

- `sonner.tsx` (sonner), `card.tsx`, `input.tsx`, `skeleton.tsx`,
  `field.tsx` — never Radix.
- Excalidraw's `MainMenu.Item onSelect` (its own API).
- Sidebar's hand-rolled `data-state={expanded|collapsed}` attribute and
  its `peer-data-[state=collapsed]:` consumers.

## App-code sweep

Swept per `consumer-props.md`: 24 `asChild` sites → `render`;
`onSelect` → `onClick` (MembersSection); `onCloseAutoFocus` →
`finalFocus` (DrawSidebar, TreeRowActions via `use-inline-rename`'s new
`menuFinalFocus`); `delayDuration` → `delay`; `--radix-*` CSS vars →
`--anchor-width`; trigger `data-[state=open]:` classes →
`data-popup-open:`. Final grep for `radix-ui|@radix-ui|asChild` over
`src/` is clean.

## Behavior deltas (flagged)

- Alert dialog initial focus: first tabbable element, not the Cancel
  button (see alert-dialog.md).
- Menu checkbox/radio items default to `closeOnClick={false}`; the sort
  radios opt in at the call site (see dropdown-menu.md).
- Separator is always semantic (`decorative` dropped).
- `onOpenChange`-family callbacks gain an `eventDetails` second argument.

## FLAG — components.json still says `new-york`

The style has no base-prefixed counterpart, so future `shadcn add
<component>` will deliver **radix** variants. Either add new components
by hand-migrating them the same way, or switch the project to a
`base-<style>` and restyle. Not fixed here by design (skill rule for
legacy styles).

## Final verification

- `pnpm typecheck` — clean (baseline was clean).
- `pnpm test` — 337/337 passed (baseline 337/337).
- `pnpm build` — production build succeeds.
- `pnpm lint` — clean after `biome check --write`.

0 wrappers remain on Radix.
