# button

2026-07-21, transformation engine (legacy `new-york` style — no base
counterpart, user classes kept verbatim). Migrated to the real
`@base-ui/react/button` primitive. Clean.

## Changed

- `src/components/ui/button.tsx` — `Slot`/`asChild` idiom replaced by
  `<ButtonPrimitive>` (native `render` support); props type is now
  `ButtonPrimitive.Props & VariantProps<typeof buttonVariants>`. Variants,
  sizes, and the custom `data-variant`/`data-size` attributes unchanged.
- `src/routes/invite.tsx`, `src/routes/reset-password.tsx` —
  `<Button asChild><Link/></Button>` → `<Button render={<Link/>}
  nativeButton={false}>` with children hoisted.

Leftover scan (`grep -n "radix-ui\|@radix-ui"`) clean on all three files.

## Left alone

- `button.test.tsx` — passes unchanged (asserts classes + `data-slot`).

## Behavior changes

None observed; ButtonPrimitive renders a native `<button>`.

## Verify by hand

- Tab to a Button, press Enter/Space — activates.
- "Go to sign in" on a dead invite/reset link navigates as a styled link.
