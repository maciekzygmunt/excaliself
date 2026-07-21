# label

2026-07-21, transformation engine. Radix Label has no Base UI counterpart;
replaced with a native `<label>`. Clean.

## Changed

- `src/components/ui/label.tsx` — `LabelPrimitive.Root` → `<label>`;
  classes unchanged (`select-none` already covers Radix's double-click
  text-selection guard).

Leftover scan clean.

## Left alone

Consumers pass `htmlFor`/children only — no call-site changes needed.

## Behavior changes

None.

## Verify by hand

- Click a form label — the associated input focuses.
