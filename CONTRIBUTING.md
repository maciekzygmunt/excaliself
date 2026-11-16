# Contributing

Thanks for your interest. Excaliself is a small project run in spare time, so
there is no promise of support or reviews. Forks are welcome.

## Setup

See [Local development](./README.md#local-development) in the README. To work
without Postgres, run `pnpm dev:preview` and open `/preview/login`.

## Checks

Run these before you open a pull request:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

The tests need Node 22.

## Updating Excalidraw

`@excalidraw/excalidraw` is pinned to an exact pre-release build from
Excalidraw's `release` branch, the code that excalidraw.com runs. Stable
releases are about a year apart.

To update it:

1. Pin the newer build: `pnpm add -E @excalidraw/excalidraw@<version>`.
2. Read the "Unreleased" part of its
   [changelog](https://github.com/excalidraw/excalidraw/blob/master/packages/excalidraw/CHANGELOG.md)
   for breaking changes.
3. Run the checks. The tests in `src/features/mcp` compare the server's own
   drawing code with the real package, so they show what to port.
4. Run `pnpm tsx scripts/export-fonts.ts` and
   `pnpm tsx scripts/excalifont-widths.ts`, which read the package's fonts.

## Pull requests

- Keep each pull request small and about one thing.
- Say what changes for a user, and how you tested it. Add a screenshot for UI
  changes.
- Add or update tests when you change behavior.
- If a user or self-hoster sees the change (a feature, a setting, an env var, a
  limit), update the docs in `landing/src/content/docs/` in the same pull
  request.
- After a schema change, run `pnpm db:generate` and commit the migration.
- For a large change, open an issue first, so we can agree on the approach
  before you spend time on it.
