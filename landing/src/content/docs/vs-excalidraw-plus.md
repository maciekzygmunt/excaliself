---
title: Excaliself vs Excalidraw+
description: An honest comparison of self-hosted Excaliself and the paid, hosted Excalidraw+, with prices and features as published by each.
---

Excalidraw+ is the hosted, paid product from the makers of Excalidraw.
Excaliself is an independent, MIT-licensed app that you run on your own server.
It is not affiliated with Excalidraw. Both are built around the Excalidraw
editor, so drawing feels the same. The difference is who runs it and what
surrounds the canvas.

Information about Excalidraw+ comes from
[plus.excalidraw.com](https://plus.excalidraw.com/pricing) as we last read it
and can change. Check it before you decide.

## Short version

- **Pick Excalidraw+** if you want someone else to run it, or need what it lists
  and Excaliself does not: presentations, voice hangouts and screen sharing,
  comments, PDF and PPTX frame export, and SOC 2 Type 2 compliance.
- **Pick Excaliself** if your drawings must stay on your own infrastructure, you
  want a flat cost regardless of seat count, or you want your own single
  sign-on.

## Side by side

| | Excaliself | Excalidraw+ |
|---|---|---|
| Hosting | You host it (Docker Compose, Coolify) | Hosted by Excalidraw |
| Price | Free, MIT licensed. You pay for your own server | Free tier; Plus is $6 per user per month, with a 14-day trial |
| Where drawings are stored | Your Postgres | Excalidraw's cloud |
| Editor | The Excalidraw editor, with auto-save | The Excalidraw editor |
| Live collaboration | Yes, with live cursors and follow mode; guests can join by link | Yes, with team management |
| Team space and folders | Shared Team space, private spaces, nested folders, stars, search by title and by text inside drawings | Unlimited scenes and folders on Plus |
| Shared library | Team library stored on the server | Libraries |
| Single sign-on | Google Workspace, Microsoft Entra ID, any OIDC provider | Not listed on the pricing page |
| AI | Your MCP client (for example Claude) reads and creates drawings; the instance needs no LLM key | AI requests (100 a day on Plus, or your own key), plus MCP and REST API in public beta |
| Presentations, voice, comments | Not available | Listed for Plus |
| PDF and PPTX frame export | Not available | Listed for Plus |
| Compliance | None claimed; it is your server and your responsibility | SOC 2 Type 2, encryption at rest and in transit |
| Support | Community; no support promise | Hosted product |

## What you take on by self-hosting

You run the server: updates, backups, TLS and uptime. Excaliself keeps this
small (one app, one Postgres), and updating is `docker compose pull && docker
compose up -d`, but it is still your job. See the
[self-hosting guide](/docs/self-host-excalidraw/).

## Moving from Excalidraw+

Excaliself can import scenes, shared collections and images from Excalidraw+
with an API key (beta). Shared collections become folders in Team. See
[Import drawings](/docs/import/). You can try it with a copy of your data
first, since Excalidraw+ stays untouched.
