---
title: Excaliself vs Nextcloud Whiteboard
description: Nextcloud Whiteboard and Excaliself both put the Excalidraw editor on your server. If you already run Nextcloud, the answer is easy. If not, see the trade-offs.
date: 2026-11-12
---

[Nextcloud Whiteboard](https://github.com/nextcloud/whiteboard) is the
official whiteboard app for Nextcloud, built on the Excalidraw editor.
[Excaliself](https://github.com/maciekzygmunt/excaliself) is a standalone app
built on the same editor. I maintain Excaliself. I checked Whiteboard at
v2.1.2 (October 2026) in its repository.

The short answer: if you already run Nextcloud, use Whiteboard. The rest of
this post is for teams that do not.

## Side by side

| | Excaliself | Nextcloud Whiteboard |
|---|---|---|
| License | MIT | AGPL-3.0 |
| What you run | App and Postgres | Nextcloud, the app, a websocket server, and Redis for more than one node |
| Users and SSO | Its own accounts. Google Workspace, Microsoft Entra ID, OIDC | Nextcloud users, groups, and SSO apps |
| Sharing | Team space, Private space, guest links | Nextcloud file sharing |
| Storage | Rows in Postgres | `.whiteboard` files in Nextcloud |
| Live collab | Built into the app | Separate websocket server with a shared JWT secret |
| Comments | Pinned to shapes | Yes |
| Version history | No | Nextcloud file versions |
| Extras | Team library, search inside drawings, Excalidraw+ import | Voting, timer, presentation mode, recording |
| AI | MCP server for Claude and other clients | Prompt to Mermaid diagram through Nextcloud Assistant |
| Scaling | One replica | Several nodes with Redis |

## Where Nextcloud Whiteboard is ahead

- **It is part of Nextcloud.** Users, groups, SSO, folders, sharing, and
  storage come from the Nextcloud you already run. A board is a file, next to
  your other files.
- **Version history** from Nextcloud file versions, with a preview.
- **Meeting tools:** voting, a timer, presentation mode, and recording.
- **Scale.** With Redis, the websocket server runs on several nodes. Its
  README has load test numbers up to 500 users
  ([README](https://github.com/nextcloud/whiteboard/blob/v2.1.2/README.md)).
  Excaliself runs as one replica.

## Where Excaliself is ahead

- **Less to run without Nextcloud.** One app container and Postgres, or a
  [Railway template](https://railway.com/deploy/excaliself), or a
  [Coolify compose file](/docs/coolify/). Whiteboard needs a full Nextcloud
  plus its websocket container, and both must share `JWT_SECRET_KEY`.
- **A whiteboard-first home.** A gallery of drawing previews, recent and
  starred drawings, nested folders, a Team space, and a command palette
  (<kbd>⌘K</kbd>) ([Organize and find](/docs/organize/)).
- **Search inside drawings,** over the text on the canvas.
- **MCP.** Claude and other MCP clients can find, read, create, and export
  drawings, and answer comments. Changes to a drawing wait for **Apply**
  ([Connect an AI client](/docs/mcp/)). No AI provider is needed on the
  server.
- **Excalidraw+ import** with an API key ([Import](/docs/import/)).
- **A shared team library** saved on the server
  ([Team library](/docs/team-library/)).
- **MIT license,** if AGPL is a problem for your company.

## Which one?

- **You run Nextcloud:** Whiteboard. Your users, groups, and storage are
  already there.
- **You do not run Nextcloud and want only the whiteboard:** Excaliself. The
  [quick start](/docs/) is one compose file.

For more options, see
[open-source alternatives to Excalidraw+](/blog/excalidraw-plus-alternatives/).
