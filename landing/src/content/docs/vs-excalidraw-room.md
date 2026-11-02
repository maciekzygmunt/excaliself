---
title: Excaliself vs a plain excalidraw-room setup
description: How Excaliself compares with running the Excalidraw editor plus the excalidraw-room collaboration server yourself.
---

The usual do-it-yourself way to get live collaboration on self-hosted
Excalidraw is to build the Excalidraw app, run
[excalidraw-room](https://github.com/excalidraw/excalidraw-room), and point the
editor at it. It works, and it is the right choice if you want the least
software between you and upstream Excalidraw. This page lists what you get and
what you still have to build in each approach.

## What excalidraw-room is

excalidraw-room is a small Socket.IO server that relays encrypted messages
between people in the same room. It is MIT licensed. In its source it handles
joining rooms and broadcasting updates, and has no accounts, folders, or
database of its own. The editor is a separate app that you build with the
collaboration server URL set (`VITE_APP_WS_SERVER_URL`). The default build also
points at Excalidraw's hosted Firebase project for storing shared scenes and
files, so keeping that data on your own servers means providing your own
storage backend and configuration. At the time of writing the repository's last
commit was in July 2024.

## Side by side

| | Editor + excalidraw-room | Excaliself |
|---|---|---|
| Parts to run | Built editor, room server, a storage backend you configure, a reverse proxy | One app, one Postgres, a reverse proxy |
| Prebuilt image | Build it yourself, or use a third-party image | `ghcr.io/maciekzygmunt/excaliself` (amd64, arm64) |
| Live collaboration | Yes, once the editor points at your room server | Yes, built in, with live cursors and follow mode |
| Saved drawings | Not on its own: you provide storage for shared scenes | Auto-saved to Postgres |
| Accounts and invites | None | Invite-only accounts; the first visitor becomes admin |
| Single sign-on | None | Google Workspace, Microsoft Entra ID, any OIDC provider |
| Folders, search, trash | None | Nested folders, stars, search inside drawings, trash with 30-day restore |
| Team space and library | None | Shared Team space, team library |
| MCP for AI clients | None | Built in at `/api/mcp` |
| Updates | Rebuild and redeploy parts | `docker compose pull && docker compose up -d`, with migrations on startup |
| Tracks upstream Excalidraw closely | Yes, you build from upstream | Uses the `@excalidraw/excalidraw` package at the version each release ships |

## When the DIY route is better

- You want the stock Excalidraw app with no extra layer, and are fine with
  anonymous, link-based sessions.
- You already run your own storage and identity systems and want to integrate
  Excalidraw with them yourself.
- You need to modify the editor build itself.

## When Excaliself is better

- You want a team to log in, find drawings later, and organise them without
  assembling the pieces.
- You want single sign-on and an admin who can manage members.
- You want to let an AI client such as Claude read and create drawings.

Start with the [self-hosting guide](/docs/self-host-excalidraw/).
