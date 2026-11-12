---
title: How to self-host Excalidraw (with collaboration that stays on your server)
description: Run the official Excalidraw Docker image, see why live collaboration still calls excalidraw.com, and get self-hosted Excalidraw with collab on your own server.
date: 2026-11-12
---

The Excalidraw editor is MIT licensed, and the Excalidraw team publishes a
Docker image of the app. So a self-hosted Excalidraw takes one `docker run`.
The hard part is what that container does not do: it keeps no drawings on the
server, and its live collaboration is built to use excalidraw.com's own
servers.

I maintain [Excaliself](https://github.com/maciekzygmunt/excaliself), a
self-hosted app built around the Excalidraw editor, so I read this code
often. This post shows the manual path first, with links to the upstream
source for each step, and then the path I built.

## Run the official Excalidraw Docker image

The Excalidraw developer docs give
[this command](https://docs.excalidraw.com/docs/introduction/development#self-hosting):

```bash
docker run --rm -dit --name excalidraw -p 5000:80 excalidraw/excalidraw:latest
```

Open `http://localhost:5000` and you have the editor. The image is the static
build of the excalidraw.com app served by nginx: the
[Dockerfile](https://github.com/excalidraw/excalidraw/blob/master/Dockerfile)
builds it with Vite and copies the output into `nginx:stable-alpine-slim`.
[CI publishes it](https://github.com/excalidraw/excalidraw/blob/master/.github/workflows/publish-docker.yml)
from the `release` branch for amd64, arm64, and arm/v7. The docs say it
contains no analytics.

The same docs page also says:

> At the moment, self-hosting your own instance doesn't support sharing or
> collaboration features.

The next two sections explain why.

## Your drawings stay in the browser

The app has no server-side storage. It saves the scene in the browser's
`localStorage` under the key `excalidraw`, the editor state under
`excalidraw-state`, and pasted images in an IndexedDB store named `files-db`
([LocalData.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts),
[app_constants.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts)).

In practice:

- Each browser profile has one canvas. There is no list of drawings and no
  accounts.
- Open the same URL on your laptop and your phone, and you see two different
  canvases.
- If you clear site data, the drawing is gone. To keep a drawing, use
  **Save to...** then **Save to file**, and store the `.excalidraw` file
  yourself.

For one person who wants a whiteboard on their own domain, this can be
enough.

## Why live collaboration still calls excalidraw.com

When you click **Live collaboration**, the app opens a Socket.IO connection to
`import.meta.env.VITE_APP_WS_SERVER_URL`
([Collab.tsx](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/collab/Collab.tsx)).
Vite replaces `import.meta.env` values with
[fixed strings at build time](https://vite.dev/guide/env-and-mode). The
production build reads them from
[`.env.production`](https://github.com/excalidraw/excalidraw/blob/master/.env.production),
which sets:

```bash
VITE_APP_WS_SERVER_URL=https://oss-collab.excalidraw.com
VITE_APP_BACKEND_V2_POST_URL=https://json.excalidraw.com/api/v2/post/
VITE_APP_FIREBASE_CONFIG='{"projectId":"excalidraw-room-persistence", ...}'
```

These URLs are in the JavaScript files inside the image. An environment
variable on the container cannot change them. Collaboration also uses more
than the websocket:

- **The websocket server** relays changes between the people in a room.
- **Firebase** keeps a saved copy of each room. The app writes the scene to
  Firestore and the room's images to Firebase Storage
  ([firebase.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/firebase.ts)),
  with the project in `VITE_APP_FIREBASE_CONFIG`.
- **Shareable links** (export to a read-only link) post the scene to
  `json.excalidraw.com`
  ([data/index.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/index.ts)).

All three are encrypted in the browser. The key is in the link fragment
(`#room=` for a collaboration room, `#json=` for a read-only link), and
browsers do not send the fragment to any server. So
excalidraw.com stores ciphertext. Still, if your rule is "drawings do not
leave our network", the stock image does not follow it.

## Run excalidraw-room yourself

[excalidraw-room](https://github.com/excalidraw/excalidraw-room) is the
collaboration server. It is a small Socket.IO relay: it takes an encrypted
`server-broadcast` message and sends it to the rest of the room as
`client-broadcast`. It does not decrypt or save anything
([src/index.ts](https://github.com/excalidraw/excalidraw-room/blob/master/src/index.ts)).

Things to know before you use it:

- It listens on `PORT`, and the default is `80` unless `NODE_ENV` is
  `development`.
- `CORS_ORIGIN` is the allowed origin. The default is `*`.
- The [Dockerfile](https://github.com/excalidraw/excalidraw-room/blob/master/Dockerfile)
  uses `node:12-alpine`. The last push to the repository was in July 2024,
  and the `latest` image on Docker Hub is from December 2023.

Run it next to the app:

```bash
docker run -d --name excalidraw-room -p 3002:80 \
  -e CORS_ORIGIN=https://draw.example.com \
  excalidraw/excalidraw-room:latest
```

Then build the app yourself with your URL in it:

```bash
git clone https://github.com/excalidraw/excalidraw.git
cd excalidraw
# In .env.production, set:
# VITE_APP_WS_SERVER_URL=https://collab.example.com
docker build -t excalidraw-selfhosted .
docker run -d -p 5000:80 excalidraw-selfhosted
```

Edit `.env.production` itself. A `.env.production.local` does not work here,
because the repository's
[`.dockerignore`](https://github.com/excalidraw/excalidraw/blob/master/.dockerignore)
lets only `.env.development` and `.env.production` into the build.

Put both behind a reverse proxy with HTTPS, and let it pass WebSocket upgrades
to the room server.

What you have now:

- Live collaboration goes through your own relay.
- Each room still saves its copy to the Firebase project in
  `VITE_APP_FIREBASE_CONFIG`. Firebase is the only storage backend in the
  app's code. To keep that copy on your side, use your own Firebase project or
  change the code.
- Read-only share links still go to `json.excalidraw.com` unless you change
  `VITE_APP_BACKEND_V2_*` and run a server for them.
- Drawings are still in each person's browser. There are still no accounts and
  no list of drawings. A room is a URL that you send in chat.
- You repeat the build for each upstream update.

## The other path: one app with its own database

I built Excaliself because I wanted the Excalidraw editor with the parts a
team needs, and with no build step and no Firebase. It embeds the official
`@excalidraw/excalidraw` package unchanged. Around it, it adds the parts that
the excalidraw.com app leaves to its own services:

- **Storage in Postgres.** Every drawing, its pasted images, and the share
  links are in one Postgres database. One `pg_dump` backs up the whole
  instance ([Backup and restore](/docs/backup-restore/)).
- **Collaboration in the same process.** The websocket is on the app's own
  port, under `/ws/`. The server keeps the scene of each open drawing, merges
  each change, and saves it. There is no separate room server to run.
- **Accounts.** The first visitor creates the admin account, and everyone
  else joins with an invite link or
  [single sign-on](/docs/single-sign-on/) (Google Workspace, Microsoft Entra
  ID, or OIDC).
- **A list of drawings.** A Private space for each member and a
  [Team space](/docs/team-space/) for everyone, with nested folders, stars,
  trash, and [search](/docs/organize/#search) that also reads the text inside
  drawings.
- **Guests.** A [share link](/docs/sharing/) can let people without an
  account draw with you, live.

The public URL is `BASE_URL`, an ordinary environment variable read when the
app starts. Nothing is compiled into the image, so you pull the same
prebuilt image (amd64 and arm64) as everyone else.

There are trade-offs, and I want to name them:

- **No end-to-end encryption.** The server reads your drawings, because it
  saves them, searches them, and serves them to an AI client over MCP. The
  data stays in your database, but the server can read it.
- **One replica.** The live state of each open drawing is in the app's
  memory, so run one app container. Each release note says this.
- **Limits.** A live drawing has 25 seats. An image can be up to 2 MB, and a
  drawing can hold up to 20 MB of images
  ([limits](/docs/sharing/#limits)).

## Deploy Excaliself

All three paths run the same image next to a Postgres database.

### Try it first

One container, no database, data in memory:

```bash
docker run --rm -p 127.0.0.1:3000:3000 -e PREVIEW_MODE=true ghcr.io/maciekzygmunt/excaliself
```

Open `http://localhost:3000/preview/login` to sign in as the admin, with
example drawings. Open `http://localhost:3000/preview/login?account=new` in a
second browser to test live collaboration as another member.

### Docker Compose

```bash
mkdir excaliself && cd excaliself
curl -fsSLO https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/docker-compose.yaml
curl -fsSL -o .env https://raw.githubusercontent.com/maciekzygmunt/excaliself/main/.env.example
# set POSTGRES_PASSWORD, BETTER_AUTH_SECRET, and BASE_URL in .env
docker compose up -d
```

The compose file starts the app and `postgres:17-alpine`. Postgres is not
published on the host. The app runs its database migrations when it starts,
so an upgrade is `docker compose pull && docker compose up -d`.

Put a reverse proxy with HTTPS in front of port 3000. Caddy and Traefik pass
WebSockets by default. nginx needs the `Upgrade` headers, and a
`client_max_body_size` above its 1 MB default, for images. The
[Docker Compose docs](/docs/docker-compose/#reverse-proxy) have the nginx
block.

### Railway

[Deploy on Railway](https://railway.com/deploy/excaliself) with the template.
It adds the app and a Postgres database, generates the auth secret and a
domain, and sets the port and healthcheck. Open the domain and create the
admin account. The [Railway docs](/docs/railway/) also have the manual setup
and how to upgrade.

### Coolify

1. Add a new resource from the public repository
   `https://github.com/maciekzygmunt/excaliself`, branch `main`.
2. Choose the **Docker Compose** build pack and set **Docker Compose
   Location** to `/docker-compose.coolify.yaml`.
3. Click **Deploy**.

Coolify creates the database, the secrets, and a domain
([Coolify docs](/docs/coolify/)).

## Bring your drawings with you

If you used the plain app, save each drawing with **Save to file**, and drop
the `.excalidraw` files on a folder in the Excaliself sidebar. If you come
from Excalidraw+, **Settings → Import** brings your scenes, collections, and
images with an Excalidraw+ API key ([Import](/docs/import/)).

## Which one should you run?

- **Only you, no collaboration:** the official image. It is one static
  container with nothing to back up on the server.
- **End-to-end encrypted rooms, and you accept a custom build:** the official
  app with your own `excalidraw-room`, and your own Firebase project if the
  room copies must stay with you.
- **A team that wants accounts, a shared list of drawings, and live editing
  stored in its own database:** Excaliself. The
  [quick start](/docs/) takes a few minutes.

## Sources

- Excalidraw self-hosting docs:
  [docs.excalidraw.com](https://docs.excalidraw.com/docs/introduction/development#self-hosting)
- Build-time collab URL and services:
  [`.env.production`](https://github.com/excalidraw/excalidraw/blob/master/.env.production),
  [Collab.tsx](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/collab/Collab.tsx),
  [firebase.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/firebase.ts)
- Browser storage:
  [LocalData.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/data/LocalData.ts),
  [app_constants.ts](https://github.com/excalidraw/excalidraw/blob/master/excalidraw-app/app_constants.ts)
- The collaboration server:
  [excalidraw-room](https://github.com/excalidraw/excalidraw-room)
- Vite environment variables:
  [vite.dev](https://vite.dev/guide/env-and-mode)
- Excaliself: [GitHub](https://github.com/maciekzygmunt/excaliself),
  [docs](/docs/)
