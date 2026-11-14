---
title: Making Excalidraw collaboration server-authoritative
description: How excalidraw.com syncs drawings between browsers with end-to-end encryption, why Excaliself merges and saves on the server instead, and what that costs.
date: 2026-11-16
---

I build [Excaliself](https://github.com/maciekzygmunt/excaliself), a self-hosted alternative to Excalidraw+ for teams. It embeds the unmodified `@excalidraw/excalidraw` package, so the editor is the Excalidraw team's work. Around it I wrote the backend: accounts, folders, a shared team space, search, comments, and live collaboration, with every drawing in Postgres.

Live collaboration took the most thought. I kept Excalidraw's message shapes and merge rule, but moved the source of truth from the browsers to the server. This post explains how excalidraw.com does it, why I did not copy that as is, what I built instead, and what it costs.

## How collaboration works on excalidraw.com

The Excalidraw team wrote about this in two posts from 2020: [End-to-End Encryption in the Browser](https://plus.excalidraw.com/blog/end-to-end-encryption) and [Building Excalidraw's P2P Collaboration Feature](https://plus.excalidraw.com/blog/building-excalidraw-p2p-collaboration-feature). The links to the code below point to the Excalidraw repository as of November 2026.

**The key never reaches a server.** A room link looks like `#room=<roomId>,<key>` ([`excalidraw-app/data/index.ts`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/excalidraw-app/data/index.ts#L158-L163)). Browsers do not send the part after `#` to the server. The browser makes a 128-bit AES-GCM key with the Web Crypto API and uses a new random IV for each message ([`packages/excalidraw/data/encryption.ts`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/packages/excalidraw/data/encryption.ts), [`ENCRYPTION_KEY_BITS`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/packages/common/src/constants.ts#L417)). The room id does go to the server; the key does not.

**The server is a relay.** [excalidraw-room](https://github.com/excalidraw/excalidraw-room/blob/03ff435860b508d7cd9e005cfc90f7977ae2a593/src/index.ts) is a small Socket.IO server. When a client sends `server-broadcast`, the server forwards the encrypted buffer and its IV to the other sockets in the room as `client-broadcast`. It tells clients `first-in-room` or `new-user` and sends `room-user-change` when people come and go. It also keeps follow-mode rooms. It has no database and cannot decrypt anything.

**Each client merges.** Every element has a `version` that goes up on each edit and a random `versionNonce`. A client keeps its own copy of an element if it is editing that element, if its version is higher, or, on equal versions, by the lower nonce ([`reconcile.ts`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/packages/excalidraw/data/reconcile.ts#L23-L44)). The server never merges.

**A peer gives you the scene.** When you join, the server sends `new-user` to the existing clients, and each of them sends you the full scene as `SCENE_INIT` ([`Portal.tsx`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/excalidraw-app/collab/Portal.tsx#L49-L55)). You read from storage only if you are first in the room or no peer answers within 5 seconds ([`Collab.tsx`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/excalidraw-app/collab/Collab.tsx)).

**Clients also save.** The scene is stored encrypted in Firestore, one document per room in the `scenes` collection, as `{ sceneVersion, iv, ciphertext }`. Each save runs in a Firestore transaction: the client decrypts the stored scene, merges it with its own, encrypts the result, and writes it ([`firebase.ts`](https://github.com/excalidraw/excalidraw/blob/01dc5ec62e54e2b7868b8a527a1d293d8e3cc516/excalidraw-app/data/firebase.ts)). Saves are throttled to every 20 seconds, plus one on page unload. Images go to Firebase Storage, also encrypted with the room key.

This design is very good at what it promises: the people who run the servers cannot read your drawing. The cost is that all the logic lives in the browsers, and the stored data is a blob that only a client with the key can read or merge.

## Why I did not copy it

In Excaliself a drawing belongs to an account. It is a row in Postgres that shows in a sidebar and a gallery, has a preview, and is searchable by the text inside it. An AI client can read it over MCP and propose edits to it. The server must read the scene to do any of this.

My first plan was the simple port: the relay forwards messages, and the owner's tab keeps saving the drawing like it does when you draw alone. That fails as soon as the owner closes the tab. The guests keep drawing, and nobody saves their work.

The excalidraw.com answer is to let every client save. For me that means giving every guest's browser, maybe someone with no account, a way to write the owner's database row and trusting that browser's merge. With encryption gone, the server can see every frame anyway. So I made it the one place where frames merge and the only thing that writes the stored scene.

## What Excaliself does instead

```
member tab  ─┐
member tab  ─┼─ WebSocket (plain JSON) ─► Room for drawing X ─► Postgres
guest tab   ─┘                            in memory, merges      drawings.data
                                          every frame            (15 s timer,
                                                                  last leave, SIGTERM)
```

**A Room per drawing.** The first socket to join a drawing creates its Room. The Room loads the stored scene once, and joins that arrive while it loads wait for the same read. From then on the Room holds the elements in memory. There is at most one Room per drawing, keyed by the drawing id, not by the link. A member who opens a Team drawing from the sidebar and a guest who comes in on its link meet in the same Room.

**The same protocol, without the envelope.** The message types are upstream's: `SCENE_INIT`, `SCENE_UPDATE`, `MOUSE_LOCATION`, `USER_VISIBLE_SCENE_BOUNDS`. They go as plain JSON over a native WebSocket on the app's own port, not Socket.IO. The client logic is a port of upstream's too: send only elements whose version changed, and send the full scene again 20 seconds after a change, so a peer that missed a frame is repaired.

**The server merges first.** The server has its own copy of `reconcileElements`. I kept the port as close to the 0.18 release that the browsers run as I could, so the Room and the browsers pick the same winner:

```ts
// local element is newer
local.version > remote.version ||
// resolve conflicting edits deterministically by taking the one with the
// lowest versionNonce
(local.version === remote.version &&
  local.versionNonce < remote.versionNonce)
```

The Room passes an empty editing state, because it is never in the middle of a drag. After a merge, the other peers get the winning elements. The sender gets only the elements it lost, so its canvas moves to the Room's version. Peers hear what the Room decided, not what the sender claimed.

**Joining reads from the Room.** A joiner gets `SCENE_INIT` from the server, not from a peer. The client merges it with whatever it already has and sends back only what the Room lacks. That same step brings back edits made while a tab was offline.

**Saving is a timer on the server.** The first change after a write marks the Room dirty and starts a 15-second timer. Changes in those 15 seconds go into the same write. Writes are chained on one promise, so an older write never lands last. The last person to leave triggers a write before the Room is dropped. The write replaces only `elements` in the stored JSON, updates the search text, and removes stored images that no element uses any more. It keeps new uploads for an hour, because an image can arrive before the element that shows it.

**One writer at a time.** A private drawing with no link is saved by its creator's tab, as before. When a link exists, or the drawing is in the Team space, the server refuses that save, and the tab joins the Room instead. Team drawings are always a Room, even with one person in it. Then a second member's arrival is a plain join and not a change of writer, which was the riskiest moment in the design.

**AI edits take the same path.** An MCP client cannot write a scene. Its edit waits as a proposal until a member clicks Apply on the drawing. Then that member's tab puts the change on its canvas as an ordinary local edit, and the Room merges and saves it like any other. When an AI client reads a drawing that has a live Room, it reads the Room's scene, not the stored one.

**Presence comes from the server.** The server keeps the roster and picks cursor colors. Other people see only a random connection id per socket, never a user id. Members' names come from their session; a guest picks its own name, and only its own browser stores it. For follow mode, the Room sends viewport frames only to followers, so a room where nobody follows anyone carries no viewport traffic.

**Guests and links.** A share link is a 256-bit random token with an audience: members of the instance, or anyone. The server checks the origin and the token on the upgrade, and checks the token again after the socket has a seat, so a link that is stopped during the handshake cannot leave anyone seated. A dead link closes with code 4010, which tells the client to stop retrying. A room holds 25 people. People without access to the drawing, such as guests, can fill only 24 seats, so they cannot lock out someone who has access.

**When the owner leaves,** nothing special happens. The owner is one seat like the others. The Room lives while anyone is connected and saves when the last person leaves.

**On restart,** the server stops taking joins, writes every Room, and closes each socket with 1012 ("Service Restart"). Clients keep their canvas, reconnect with a backoff that grows to 10 seconds, merge with the stored scene, and send what is missing. After a hard crash, the database can be up to 15 seconds behind. The reconnecting tabs send those edits again, so work is lost only if no tab that had it comes back.

## The trade-offs

**No end-to-end encryption.** The server reads every drawing, and so can anyone with access to the server, the database, or its backups. On a self-hosted instance that is you or your team, but it is a real difference from excalidraw.com. Use HTTPS.

**The server holds state.** Every live Room is a scene in memory. There are caps: 50,000 elements or 20 MB per scene, 4 MB per frame, a token-bucket budget per socket, and a limit on how much unread data a slow socket may queue before it is closed.

**One process.** The Room registry is an in-memory map, so the app must run as a single replica. A second replica would give the same drawing two Rooms. Running more than one would need routing by drawing id or a shared backplane, and I have not built either. For a team whiteboard one process is enough, but I have not done load tests, so I will not give you a number.

**Some state is not live.** The Room syncs elements only. Scene settings such as the background color are frozen at the last solo save.

## What was hard

**Untrusted frames become the server's problem.** In a relay, a bad frame breaks only the clients that read it. When the server merges, one crafted frame from a guest can break the drawing for everyone. Three examples I fixed: a version near 2^53 won every merge, so nobody could move or delete that element; an array nested 10,000 levels deep made `JSON.stringify` throw, so the Room could never save again; a U+0000 character in text made every Postgres write fail. The server now refuses versions that are not safe integers, nonces below zero, and elements nested deeper than 64 levels, and it ignores a version that jumps more than 2^20 above the Room's copy.

**Deleted elements.** Excalidraw keeps deleted elements as tombstones so deletions sync. Upstream stops syncing them after 24 hours. The Room keeps older ones to correct stale tabs, but it must never send them to a guest. Otherwise a guest invited today could read text someone deleted last week.

**Sockets that die quietly.** A tab on a laptop that went to sleep can hold a seat for a long time. Clients send a heartbeat every 25 seconds and treat a reply that does not come within 10 seconds as a dead connection. The server drops seats that are silent for 90 seconds.

**Ending a Room cleanly.** When the link to a private drawing is stopped, or any drawing goes to the trash, its Room ends. The Room clears its seats before its final write. If it did that after, an edit could merge during the write and land later, over the owner's newer solo saves.

I wrote down the main decisions as [ADRs in the repository](https://github.com/maciekzygmunt/excaliself/tree/main/docs/adr), next to the code.
