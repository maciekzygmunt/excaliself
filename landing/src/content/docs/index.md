---
title: Quick start
description: Run Excaliself and its Postgres database on your server with one compose file.
---

You need a server with Docker. The prebuilt image runs on amd64 and arm64, so
nothing is built on your server.

## Try it first

To look around before you install, run one container. It needs no Postgres and
no `.env`:

```bash
docker run --rm -p 127.0.0.1:3000:3000 -e PREVIEW_MODE=true ghcr.io/maciekzygmunt/excaliself
```

Open the sign-in URL printed in the container logs
(`http://localhost:3000/preview/login` with the command above) to sign in as
the admin, with example drawings. To test live collaboration, open
`http://localhost:3000/preview/login?account=new` in a second browser: it signs
in as a new member. To try an AI client, use the
[preview MCP token](/docs/mcp/#try-it-in-preview-mode). Data lives in memory
and is gone when the container stops. See
[preview mode](/docs/environment/#previews).

## Try a team workflow

Keep the preview container from [Try it first](#try-it-first) running. This
exercise checks the main team loop: two people edit one Team drawing, and then
one of them finds it again. Use example names only.

1. Sign in as the admin at `http://localhost:3000/preview/login`. If the
   introductory tour appears, click **Skip tour**. In the sidebar, select
   **Team**, then click **New drawing**. Type `Checkout architecture` where it
   says *Drawing name…* and press Enter.
2. In the editor, open **More tools**, then **Mermaid to Excalidraw**. The text
   box can already contain example or saved text. Replace all of it with this,
   then click **Insert**:

   ```text
   flowchart LR
     Browser --> API
     API --> Database
   ```

3. Open `http://localhost:3000/preview/login?account=new` in a second browser
   or a private window. Do not use a new tab: tabs in one browser share one
   sign-in. This signs in a new member. If the introductory tour appears, click
   **Skip tour**. Select **Team** and open **Checkout architecture**.
4. As the member, add a box in the same way. Open **More tools**, then
   **Mermaid to Excalidraw**. Replace all the text in the box with this, then
   click **Insert**:

   ```text
   flowchart LR
     Cache
   ```

   The Cache box also shows in the admin's window.
5. In the admin's window, click **Home** in the sidebar. Then click **Search**
   in the sidebar, or press ⌘K (Ctrl K on Windows and Linux). Type
   `Checkout architecture` and open the result marked **Team**. Cache is there.
6. Click **Home** again and open the **Checkout architecture** card. The
   drawing still has Cache.

**Team** shows in the sidebar when the instance has a second member, or when
Team has a drawing or folder. The preview's example content already has a
folder in Team, so it shows from the start. If you do not see **Team**, first
open only `http://localhost:3000/preview/login?account=new` in a separate
browser or private window, and click **Skip tour** if the tour appears. Then
reload the admin's window and start at step 1.

All of this is in the container's memory. When the container stops or
restarts, the data is gone. This exercise does not test a lasting install. For
that, follow [Install](#install).

## Install

```bash
mkdir excaliself && cd excaliself
curl -fsSLO https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/.env.example
```

Fill in these three values in `.env`:

| Variable | Value |
|---|---|
| `POSTGRES_PASSWORD` | `openssl rand -hex 24` |
| `BETTER_AUTH_SECRET` | `openssl rand -base64 32` |
| `BASE_URL` | The public URL users open, e.g. `https://draw.example.com` |

Then start it:

```bash
docker compose up -d
```

## Create the admin account

Open `BASE_URL`. The first visit goes to `/setup`, where you create the admin
account. After that, admins send invite links from **Settings**. You can also
let people sign in with [Google, Microsoft, or OIDC](/docs/single-sign-on/).

## Next steps

- Put a reverse proxy with HTTPS in front of it: [Docker Compose](/docs/docker-compose/).
- Run it on Coolify, Railway, Hostinger, or Unraid instead: [Coolify](/docs/coolify/),
  [Railway](/docs/railway/), [Hostinger](/docs/hostinger/), [Unraid](/docs/unraid/).
- See every setting: [Environment variables](/docs/environment/).
- Bring your team in: [Members and invites](/docs/members/).
- Take your first backup: [Backup and restore](/docs/backup-restore/).
