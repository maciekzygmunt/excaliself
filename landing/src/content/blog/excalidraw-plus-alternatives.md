---
title: Open-source alternatives to Excalidraw+ (self-hosted, 2026)
description: Excaliself, ExcaliDash, Nextcloud Whiteboard, and plain self-hosted Excalidraw compared with Excalidraw+ on accounts, SSO, collab, comments, history, and AI.
date: 2026-11-12
---

[Excalidraw+](https://plus.excalidraw.com) is the paid, hosted version of
Excalidraw, from the team that makes the editor. It adds accounts,
workspaces, collections, comments, presentations, and AI. It runs only in
Excalidraw's cloud. A self-hosted version is
[in development](https://plus.excalidraw.com/docs/self-hosting/excalidraw-plus-self-hosting)
as part of a future Enterprise license, with a waitlist.

If you need the drawings on your own server today, these are the open-source
options that use the Excalidraw editor. I maintain one of them,
[Excaliself](https://github.com/maciekzygmunt/excaliself), so read this
with that in mind. I checked each feature in the project's own repository or
docs in November 2026, and I link the sources. Where another project does
something better than Excaliself, I say so.

## The comparison

### Accounts and collaboration

|  | Accounts and SSO | Team space | Folders | Live collab | Comments |
|---|---|---|---|---|---|
| **Excalidraw+** (hosted baseline) | Accounts. SSO is in the roadmap backlog | Workspace teams | Collections, no nesting yet | Yes, with voice and screen share | Yes |
| **Excaliself** | Accounts with invites. SSO: Google, Microsoft Entra ID, OIDC | Yes: Team and Private | Nested | Built in. Guest links | Yes, pinned to shapes |
| **ExcaliDash** | Accounts. OIDC | No. Share drawings or collections with accounts | Collections, flat | Built in. Link sharing with expiry | No |
| **Nextcloud Whiteboard** | Nextcloud users and its SSO apps | Through Nextcloud sharing | Nextcloud Files folders | Separate websocket server | Yes |
| **Plain Excalidraw** (official image) | None | No | No | Needs your own build, `excalidraw-room`, and Firebase | No |

### History, AI, storage, and license

|  | Version history | AI and MCP | Storage | License |
|---|---|---|---|---|
| **Excalidraw+** (hosted baseline) | Not yet (roadmap: in progress) | Text to diagram, wireframe to code, MCP server (beta) | Excalidraw's cloud | Hosted service. The editor is MIT |
| **Excaliself** | No | MCP server. Edits wait for **Apply** | Postgres | MIT |
| **ExcaliDash** | Yes, snapshots (kept 2 days by default) | No built-in MCP | SQLite or Postgres. Images optionally on S3 | LGPL-3.0 |
| **Nextcloud Whiteboard** | Nextcloud file versions | Prompt to diagram through Nextcloud Assistant. No MCP | `.whiteboard` files in Nextcloud | AGPL-3.0 |
| **Plain Excalidraw** (official image) | No | AI calls excalidraw.com (set at build time) | Each user's browser | MIT |

Excalidraw+ costs
[$7 per user per month, or $6 paid yearly](https://plus.excalidraw.com/pricing).
The free plan needs no account and has no workspace.

## Excalidraw+: the baseline

What it does well: nothing to run, a polished presentation mode, PDF and PPTX
export, AI text to diagram and wireframe to code with 100 requests a day, and
an [MCP server](https://plus.excalidraw.com/docs/mcp) and REST API in public
beta.

What is still missing, from its own
[roadmap](https://plus.excalidraw.com/roadmap): SSO and nested folders are in
the backlog, and version history is in progress. The data is in their cloud,
which is the reason most people read a post like this one.

## Excaliself

[Excaliself](https://github.com/maciekzygmunt/excaliself) is one app image
next to Postgres. It embeds the official `@excalidraw/excalidraw` package
unchanged.

- **Accounts:** the first visitor is the admin. Others join with a
  single-use [invite link](/docs/members/) or with
  [SSO](/docs/single-sign-on/): Google Workspace, Microsoft Entra ID, or one
  OIDC provider. People from your email domains can join on their first SSO
  sign-in.
- **Spaces:** each member has a Private space, and the whole instance shares
  one [Team space](/docs/team-space/). Team drawings are always live.
- **Organization:** nested folders, stars, trash for 30 days, and search over
  titles and the text inside drawings.
- **Collaboration:** live cursors and follow mode. A
  [share link](/docs/sharing/) can let guests without an account edit.
- **Comments:** [threads pinned to a shape](/docs/comments/). They stay on the
  shape when it moves.
- **Team library:** one [shape library](/docs/team-library/) for everyone,
  saved on the server.
- **MCP:** Claude and other MCP clients can
  [search, read, create, and export drawings](/docs/mcp/), and answer
  comments. A change to a drawing is a proposal until someone clicks
  **Apply**. The server needs no AI key.
- **Import from Excalidraw+:** paste an Excalidraw+ API key in
  [Settings → Import](/docs/import/) to bring scenes, collections, and images.
  This is in beta.

Where it is behind:

- **No version history.** ExcaliDash and Nextcloud Whiteboard have it.
- **Share links always allow editing.** There is no view-only link and no
  expiry date. ExcaliDash has both.
- **One replica.** The live state of each open drawing is in the app's
  memory. Nextcloud Whiteboard scales across nodes with Redis.
- **No built-in AI** and no presentation mode.

## ExcaliDash

[ExcaliDash](https://github.com/ZimengXiong/ExcaliDash) (v0.6.7, LGPL-3.0)
is the most popular project in this list, with about 1,800 GitHub stars.

- Accounts, OIDC, or both. `AUTH_MODE` chooses: local accounts, OIDC only,
  both, or no sign-in
  ([authentication](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/guide/authentication.md)).
- You share a drawing or a collection with named accounts, with view or edit
  access. Links can be "anyone with the link" with an expiry
  ([collaboration](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/guide/collaboration.md)).
- **Version history** with preview and restore. Snapshots are kept for
  `SNAPSHOT_RETENTION_DAYS`, 2 days by default
  ([storage and backups](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/guide/storage-backups.md)).
- SQLite by default with scheduled backups, or Postgres. Images can go to S3.
- Two containers: a backend and an nginx frontend.

No shared team space, collections do not nest, search matches titles only,
and I found no comment feature or MCP server in the code. There is a
[third-party MCP server](https://github.com/ZimengXiong/ExcaliDash/issues/139).

## Nextcloud Whiteboard

[Nextcloud Whiteboard](https://github.com/nextcloud/whiteboard) (v2.1.2,
AGPL-3.0) is the official whiteboard app for Nextcloud. If you already run
Nextcloud, it is the natural choice.

- Users, groups, SSO, folders, and sharing all come from Nextcloud. A board is
  a `.whiteboard` file in Nextcloud Files.
- Comments, voting, a timer, presentation mode, and recording.
- Version history through Nextcloud file versions.
- An Assistant that turns a prompt into a Mermaid diagram, if Nextcloud has an
  AI provider set up.
- It scales across nodes with Redis.

Live collaboration needs a separate websocket server
(`ghcr.io/nextcloud-releases/whiteboard`) that shares a JWT secret with
Nextcloud ([README](https://github.com/nextcloud/whiteboard/blob/v2.1.2/README.md)).
If you do not run Nextcloud, you install all of Nextcloud to get it.

## Plain self-hosted Excalidraw

The official `excalidraw/excalidraw` image is the editor in nginx. Drawings
stay in each browser, and there are no accounts. Live collaboration is built
to use excalidraw.com's servers, and the URLs are fixed at build time. To move
it to your server, you build the image yourself and run `excalidraw-room`.
Rooms still save a copy to Firebase. The full details are in
[How to self-host Excalidraw](/blog/self-host-excalidraw/).

One thing it does better than the others: rooms are end-to-end encrypted, with
the key in the link.

## Which one?

- **You already run Nextcloud:** Nextcloud Whiteboard.
- **You need version history or view-only links today:** ExcaliDash.
- **You want a shared Team space, SSO, comments, an Excalidraw+ import, and
  MCP, in one app with Postgres:** Excaliself. Try it with one command, as
  in the [quick start](/docs/#try-it-first).
- **Only you, no collaboration:** the official image.

## Sources

- Excalidraw+: [pricing](https://plus.excalidraw.com/pricing),
  [roadmap](https://plus.excalidraw.com/roadmap),
  [MCP docs](https://plus.excalidraw.com/docs/mcp),
  [self-hosting](https://plus.excalidraw.com/docs/self-hosting/excalidraw-plus-self-hosting)
- ExcaliDash: [repository](https://github.com/ZimengXiong/ExcaliDash),
  [docs](https://excalidash.xyz),
  [environment reference](https://github.com/ZimengXiong/ExcaliDash/blob/main/docs/reference/environment.md)
- Nextcloud Whiteboard: [repository](https://github.com/nextcloud/whiteboard),
  [App Store](https://apps.nextcloud.com/apps/whiteboard)
- Excalidraw: [repository](https://github.com/excalidraw/excalidraw),
  [self-hosting docs](https://docs.excalidraw.com/docs/introduction/development#self-hosting)
- Excaliself: [repository](https://github.com/maciekzygmunt/excaliself),
  [docs](/docs/)
