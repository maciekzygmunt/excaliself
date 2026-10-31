# excaliself

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/` in this repo. See `docs/agents/issue-tracker.md`.

### Triage labels

Default label vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` and `docs/adr/` at the repo root (created lazily by `/domain-modeling`). See `docs/agents/domain.md`.

## Keep the docs current

User-facing docs live in `landing/src/content/docs/` and publish to `excaliself.com/docs/`.

- When a change adds or changes something a user or self-hoster sees (a feature, a setting, an env var, a deploy step, a limit), update the docs in the same PR.
- A new page is a markdown file there, plus one entry in the sidebar in `landing/src/lib/docs.ts`.
- Docs describe what is on `main`. Do not document unmerged work.
