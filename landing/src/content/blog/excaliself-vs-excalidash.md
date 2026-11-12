---
title: Excaliself vs ExcaliDash
description: Two self-hosted Excalidraw apps with accounts and live collab. ExcaliDash leads on version history and view-only links; Excaliself on Team space, SSO, and MCP.
date: 2026-11-12
---

[ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) and
[Excaliself](https://github.com/maciekzygmunt/excaliself) solve the same
problem: the Excalidraw editor on your own server, with accounts, a list of
drawings, and live collaboration. I maintain Excaliself. I checked ExcaliDash
at v0.6.7 (October 2026) in its repository and docs.

## Side by side

| | Excaliself | ExcaliDash |
|---|---|---|
| License | MIT | LGPL-3.0 |
| Containers | App and Postgres | Backend, nginx frontend. SQLite by default, or Postgres |
| Sign-in | Accounts with invite links. Google Workspace, Microsoft Entra ID, OIDC | Accounts. OIDC |
| Shared space | One Team space for all members, plus Private | None. Share each drawing or collection with accounts |
| Folders | Nested | Collections, flat |
| Search | Titles and the text inside drawings | Titles |
| Live collab | Built in, with guest links | Built in, with link sharing |
| Share links | Always edit. No expiry | View or edit, with an expiry |
| Comments | Pinned to shapes | None found |
| Version history | No | Snapshots, kept 2 days by default |
| AI | MCP server. Edits wait for **Apply** | No built-in MCP |
| Excalidraw+ import | Yes, with an API key (beta) | No |
| Images | In Postgres | In the database, or on S3 |

## Where ExcaliDash is ahead

- **Version history.** Open **Version History** in a drawing, preview a
  snapshot, and restore it. `SNAPSHOT_RETENTION_DAYS` sets how long snapshots
  stay ([docs](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/guide/storage-backups.md)).
  Excaliself has no history: a backup is the only way back.
- **Finer sharing.** Per-account view or edit access on a drawing or a
  collection, and links that expire
  ([docs](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/guide/collaboration.md)).
  An Excaliself share link always lets people edit, until you stop or
  regenerate it.
- **S3 for images,** and scheduled SQLite backups built in.
- **A larger community:** about 1,800 GitHub stars.

## Where Excaliself is ahead

- **A Team space.** Every member sees every Team drawing and folder with no
  share step, and Team drawings are always live
  ([Team space](/docs/team-space/)). In ExcaliDash, you share each item with
  each account.
- **SSO for whole domains.** With `SSO_ALLOWED_DOMAINS`, people from your
  company join on their first Google, Microsoft, or OIDC sign-in, with no
  invite ([Single sign-on](/docs/single-sign-on/)).
- **Comments** pinned to shapes, with replies, resolve, and unread dots
  ([Comments](/docs/comments/)).
- **MCP.** Claude and other MCP clients can find, read, create, and export
  drawings, and answer comments. Changes to a drawing wait until someone
  clicks **Apply** ([Connect an AI client](/docs/mcp/)).
- **Search inside drawings,** not only titles.
- **Excalidraw+ import** of scenes, collections, and images
  ([Import](/docs/import/)).
- **A shared team library** saved on the server
  ([Team library](/docs/team-library/)).

## Running them

Both run with Docker Compose. Excaliself is one app container next to
Postgres. It is also a [Railway template](https://railway.com/deploy/excaliself)
and a [Coolify compose file](/docs/coolify/). Run one Excaliself replica: the
live state of each open drawing is in the app's memory. ExcaliDash's
Socket.IO server has no Redis adapter in the code I read, so I expect the
same limit there, but its docs do not say.

## Which one?

Pick ExcaliDash if you need version history or view-only links now. Pick
Excaliself if your team wants one shared space, SSO for your domain,
comments, or an AI client that can draw. To try Excaliself, run:

```bash
docker run --rm -p 127.0.0.1:3000:3000 -e PREVIEW_MODE=true ghcr.io/maciekzygmunt/excaliself
```

and open `http://localhost:3000/preview/login`. The
[comparison of all Excalidraw+ alternatives](/blog/excalidraw-plus-alternatives/)
also covers Nextcloud Whiteboard.
