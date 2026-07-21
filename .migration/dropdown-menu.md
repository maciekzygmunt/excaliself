# dropdown-menu

2026-07-21, transformation engine (Radix DropdownMenu → Base UI Menu).
Largest consumer surface of the migration. Clean.

## Changed

- `src/components/ui/dropdown-menu.tsx` — Content → Portal > Positioner >
  Popup (positioning props declared → destructured → forwarded to the
  Positioner, `isolate z-50 outline-none`; align default stays "center"
  for Radix parity). Label → GroupLabel, ItemIndicator →
  CheckboxItemIndicator/RadioItemIndicator, Sub → SubmenuRoot, SubTrigger
  → SubmenuTrigger (`data-[state=open]:` → `data-popup-open:`).
  SubContent composes the public Content with the load-bearing
  `align="start" alignOffset={-3} side="right" sideOffset={0}` defaults.
  Class rewrites: `data-open`/`data-closed` animation variants,
  `--radix-dropdown-menu-content-*` vars → `--available-height` /
  `--transform-origin`. Root/Sub render no element, so their `data-slot`
  attrs are gone.
- Consumers (`asChild` → `render`, children hoisted):
  `TreeRowActions.tsx`, `DrawSidebar.tsx`, `SidebarUserMenu.tsx`
  (also `w-[--radix-dropdown-menu-trigger-width]` → `w-(--anchor-width)`;
  `DropdownMenuItem asChild` → `render={<Link/>}`),
  `DrawingGallery.tsx` (+ trigger `data-[state=open]:opacity-100` →
  `data-popup-open:opacity-100`), `BrowseToolbar.tsx`,
  `MembersSection.tsx` (also `onSelect` → `onClick` ×2).
- `onCloseAutoFocus` → Popup `finalFocus`:
  `use-inline-rename.ts` now exposes `menuFinalFocus()` (returns `false`
  while renaming); `TreeRowActions.tsx` prop renamed accordingly;
  `DrawSidebar.tsx` uses `finalFocus={false}`.
- `src/components/ui/sidebar.tsx` — trigger-driven classes
  `data-[state=open]:*` → `data-popup-open:*` in
  `sidebarMenuButtonVariants` and `SidebarMenuAction`.
- Tests: `DrawingGallery.test.tsx` / `AllDrawings.test.tsx` open menus
  with pointerdown+click (the Radix keydown-Enter jsdom workaround no
  longer opens Base UI menus).

Leftover scan clean.

## Left alone

- `DrawingCanvas.tsx` `onSelect={toggleSidebar}` — that is Excalidraw's
  own `MainMenu.Item`, not Radix.

## Behavior changes

- `DropdownMenuCheckboxItem`/`RadioItem` default to `closeOnClick={false}`
  in Base UI (Radix closed on select). The sort-order radio items in
  `BrowseToolbar.tsx` opt into `closeOnClick` to keep the app's existing
  dismiss-on-pick UX (encoded in its tests); the wrapper itself follows
  the Base UI default — future checkbox/radio items will stay open unless
  they opt in.
- `loop` → Root `loopFocus`, default flips to true (not used in app).

## Verify by hand

- Tree row “…” menu: opens to the right, Rename moves focus into the
  inline input without flicker, Move to trash doesn't toggle the folder.
- User menu: full trigger width, opens upward, links navigate.
- Gallery sort menu: picking an order closes the menu and reorders.
