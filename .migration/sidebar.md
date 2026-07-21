# sidebar

2026-07-21, transformation engine. Slot/asChild idiom → `useRender` +
`mergeProps`; composition with tooltip/sheet/dropdown updated. Clean.

## Changed

- `src/components/ui/sidebar.tsx` — `SidebarGroupLabel`,
  `SidebarGroupAction`, `SidebarMenuButton`, `SidebarMenuAction`,
  `SidebarMenuSubButton` drop `asChild` for the `render` prop via
  `useRender` + `mergeProps` (data-* literals cast to
  `React.ComponentProps<tag>` per the known excess-property pitfall).
  `data-active`/`data-size` attribute semantics preserved exactly
  ("true"/"false" strings), so all `data-[active=true]:` styling is
  untouched. A tooltip'd `SidebarMenuButton` now renders *as* the
  `TooltipTrigger` (`render: <TooltipTrigger render={render}/>`) instead
  of being wrapped by one. `TooltipProvider delay={0}` (renamed prop);
  trigger-open styling `data-[state=open]:*` → `data-popup-open:*`.
- Consumers: `SidebarNav.tsx`, `StarredSection.tsx` —
  `<SidebarMenuButton asChild><Link>…` → `render={<Link/>}` with children
  hoisted. `DrawingItem.tsx` — conditional `asChild={!renaming}` becomes
  `render={renaming ? undefined : <Link/>}` (undefined render = default
  button).

Leftover scan clean.

## Left alone

- `SidebarProvider`/`Sidebar`/rail/inset/menu list parts — plain DOM,
  unchanged. The sidebar's own `data-state={state}` attribute
  (expanded/collapsed) and its `peer-data-[state=collapsed]:` consumers
  (`route.tsx`) are hand-rolled, not Radix — intentionally kept.
- `SidebarInput`/`SidebarSeparator`/`SidebarMenuSkeleton` — compose
  already-migrated ui components.

## Behavior changes

None intended; `useRender` merges className/handlers like Slot did.

## Verify by hand

- Cmd+B toggles; collapsed rail shows tooltips on menu buttons.
- Nav links (Home/Trash/Settings), starred items, and tree rows navigate
  and show active styling; drag a drawing onto a folder still works.
- Mobile width: sidebar opens as the sheet.
