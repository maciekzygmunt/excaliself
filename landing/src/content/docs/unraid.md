---
title: Unraid
description: Install from Community Applications, with PostgreSQL in its own container.
---

The Unraid template runs the Excaliself container only. It stores every
drawing in a PostgreSQL database, which you install first.

## 1. PostgreSQL

In **Apps**, install **postgresql17** and set:

| Field | Value |
|---|---|
| `POSTGRES_PASSWORD` | The output of `openssl rand -hex 24`. Use hex: it goes into a connection URL |
| `POSTGRES_USER` | `excaliself` |
| `POSTGRES_DB` | `excaliself` |

## 2. Excaliself

In **Apps**, search for **Excaliself**, click **Install**, and fill in:

| Field | Value |
|---|---|
| **App URL** | The address you open the app at, with the port, e.g. `http://192.168.1.10:3000` |
| **Other URLs** | Optional. Other addresses you also use, comma-separated, e.g. `http://tower.local:3000` |
| **Database URL** | `postgresql://excaliself:<password>@<server IP>:5432/excaliself` |
| **Auth secret** | The output of `openssl rand -base64 32` |

Sign-in refuses any address that is not in **App URL** or **Other URLs**. See
[More than one address](/docs/environment/#more-than-one-address).

Click **Apply**, then open the WebUI. The first visitor becomes the admin, so
create your account right away.

## Upgrades and backups

The template uses the `latest` tag, so Unraid shows an update when a new
release is out. The container keeps no data: back up the PostgreSQL database
with `pg_dump`, as in [Backup and restore](/docs/backup-restore/). To copy the
PostgreSQL appdata folder instead, stop that container first. Other
settings, such as [single sign-on](/docs/single-sign-on/), go in as extra
variables with **Add another Path, Port, Variable**. They are listed in
[Environment variables](/docs/environment/).
