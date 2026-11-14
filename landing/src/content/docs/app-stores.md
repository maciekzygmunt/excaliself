---
title: App stores
description: Install Excaliself from the TrueNAS, Unraid, or Portainer app catalog.
---

Excaliself is in these app catalogs. Each one runs the prebuilt image. Sign-in
refuses any address that is not set as the app's address, so set it to the
address you open the app at. See
[More than one address](/docs/environment/#more-than-one-address).

## TrueNAS

In **Apps**, click **Discover Apps** and search for **Excaliself**. It is in
the **community** train: if it does not show, turn that train on under
**Configuration → Choose Train**. The app runs its own Postgres. Fill in:

| Field | Value |
|---|---|
| **Database Password** | The output of `openssl rand -hex 24` |
| **App URL** | Sets `BASE_URL`. The address you open the app at, with the port, e.g. `http://192.168.1.10:30583` |
| **Other URLs** | Optional. Sets `TRUSTED_ORIGINS`. Add one entry for each other address, e.g. `http://truenas.local:30583` |
| **Auth Secret** | The output of `openssl rand -base64 32` |

The default WebUI port is `30583`. Other settings, such as
[single sign-on](/docs/single-sign-on/), go in
**Additional Environment Variables**. Store page:
[apps.truenas.com](https://apps.truenas.com/catalog/excaliself_community/).

## Unraid

In **Apps**, search for **Excaliself**. Install **postgresql17** first. Set
**App URL** (`BASE_URL`) to the address you open the app at, with the port,
e.g. `http://192.168.1.10:3000`. Put other addresses in **Other URLs**
(`TRUSTED_ORIGINS`), comma-separated. The steps are in [Unraid](/docs/unraid/).
Store page: [Community Apps](https://ca.unraid.net/apps/excaliself-1ulvvg01m0exfg).

## Portainer

Excaliself is in the
[Portainer Templates](https://portainer-templates.as93.net/excaliself) list.
In Portainer, open **Settings** and set the **App Templates** URL to:

```
https://raw.githubusercontent.com/Lissy93/portainer-templates/main/templates.json
```

Then open **App Templates** and search for **Excaliself**. Set the database
password, the auth secret, and `BASE_URL`, as in
[Portainer](/docs/docker-compose/#portainer), and deploy.

## Cloud hosts

[Railway](/docs/railway/) and [Hostinger](/docs/hostinger/) deploy Excaliself
with one click. The image is also on
[Docker Hub](https://hub.docker.com/r/maciekzygmunt/excaliself).
