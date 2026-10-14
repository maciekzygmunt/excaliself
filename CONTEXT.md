# Ubiquitous Language

## Terms

### Home
The state of the canvas area when no drawing is open. Shown inside the normal app shell (sidebar visible) — not a standalone landing page. Presents recent Drawings (with Previews) and the create action; doubles as the empty state when the user has no Drawings yet. Also the landing spot after actions that orphan the user, such as deleting the currently open Drawing or following a link to a Drawing that no longer exists.

### Recent
Drawings ordered by when they were last edited (not created, not opened). Editing a Drawing is the only thing that makes it "recent".

### Drawing
A single Excalidraw document created by a member, living in a Space, identified by id, in that Space's folder tree shown in the sidebar.

### Space
Where a Drawing or folder lives: Private or Team. A folder's whole subtree is always in one Space. A member can see and act on an item iff they are its Creator or it is in Team; this one rule replaces every per-item ownership check.

### Private
One member's own Space. Only that member sees it. Works the way the app did before Team existed, Share links included. Every Drawing and folder made before Team is Private.

### Team
The instance's one shared Space. Every member sees and can do everything with every Team Drawing and folder, with no sharing step. Never called "Shared": "shared" means "has a Share link".

### Creator
The member who created a Drawing or folder. For a Private item, the only member who can see it. A Team item outlives its Creator: when that member is deleted, the item stays with no Creator ("Former member").

### Canvas area
The inset region to the right of the sidebar. Shows either an open Drawing or Home.

### Create dialog
The single way a Drawing or folder is created: a command-style dialog where the user types a name and confirms. Everything is deliberately named at birth; the app never creates a Drawing on the user's behalf.

### Gallery
The app's one grid of Drawing cards (Preview, name, folder attribution, edited-ago), ordered by Recent unless a Browse toolbar re-sorts it. Home shows it capped at 8; All drawings shows it whole; later surfaces (folder pages, trash) reuse it rather than fork it.

### All drawings
The browse surface at `/drawings`: the Gallery over every Drawing the user owns, uncapped, under the Browse toolbar. Reached from Home's "View all" link.

### Browse toolbar
The Gallery's filter chrome on All drawings: on-page search (the app's only inline filter — there is no search-results page), folder chips (All / one per folder / Unfiled) that scope the grid, and a sort dropdown (Last edited default / Date created / Name). Search and chip scope compose. Folder pages reuse it without the chip row.

### Preview
A non-interactive visual rendering of a Drawing's scene, shown on Gallery cards so drawings are recognizable by shape rather than name.

### Room
The live collaboration session around one shared Drawing. Exists only while at least one participant (owner or guest) is connected; holds the authoritative scene while live. There is at most one Room per Drawing.

### Handoff
The swap of who owns a Drawing's stored data. Unshared, its owner's canvas writes it directly (autosave); the moment a Share link exists the Room becomes the only writer, every tab — the owner's included — edits through the socket, and the server refuses direct writes. Stopping sharing hands it back. Both directions flush before they let go, so no edit lives only in the writer being retired.

### Share link
The one live edit link a Drawing can have (`/share/<token>`), minted and managed by the owner from the Share dialog. "Shared" is derived — a Drawing is shared iff its link exists; stopping sharing deletes it, regenerating replaces the token (old URL dies). Carries an Audience: `members` (any signed-in member of this instance, the default) or `anyone` (no account needed). A link whose token, Audience, or Drawing no longer checks out is dead — every dead link looks identical, revealing nothing about whether the Drawing exists.

### Participant
One socket connected to a Room, as everyone else in it sees it: a display name, an assigned cursor color, and whether it belongs to a member or a guest. Identified by a Connection id, never by a userId — a member's account never crosses the wire to a guest. A member's name comes from their session and cannot be set from the client; a guest's is a pseudonym it generates and keeps in its own browser.

### Connection id
The random id a socket is given when it joins a Room, and the only handle other Participants have on it. Ephemeral by design (spec §4.4): reconnecting produces a new one, so it is not an identity that can be tracked or blocked — abuse limits key on IP instead.

### Heartbeat
A tiny frame each Participant sends every ~25 s, and the answer the server sends back. It exists to be traffic: a Room where everyone is reading rather than drawing is a live session, and without it a reverse proxy's idle timeout would close the sockets out from under it. The answer is the second half — a Participant whose heartbeat goes unanswered treats its Connection as dead even though the socket still claims to be open, which is the only way a connection that died without saying so is ever noticed.

### Reconnecting
The state of a Participant whose socket has dropped: the canvas stays live and editable, edits keep landing locally, and the client dials the Room again on a jittered backoff, indefinitely. Announced by one quiet indicator and nothing else — no warning, no retry button, and never any "lost work" language, because there is none: the rejoin merges what was drawn during the outage with whatever the Room has. Two answers end it instead of another dial — the Room is full, or the Share link is dead.

### Following
A one-way arrangement between two Participants in a Room: the follower's canvas rides along with the followed Participant's viewport, marked by a ring in that Participant's color and a chip naming them. Started by clicking their avatar, ended by clicking the chip, their avatar, panning or zooming, or by them leaving. Nobody can be made to follow, and being followed changes nothing about what the followed Participant can do — only that their viewport is relayed to whoever is watching.

### Live badge
What the owner sees on a Drawing of theirs that has a Room with someone *else* in it: a stack of Participant avatars on the Gallery card, a count on the sidebar row. Their own connections never count, so a Drawing they alone have open wears no badge. Ambient rather than exact — it is polled, so it trails joins and leaves by up to half a minute, and it is not a control: clicking a badged card just opens the Drawing, which joins the Room.

### Scene image
An image on a Drawing's canvas, stored as bytes under a content-addressed file id that the image element on the scene points at. Bytes and elements travel separately in a Room: the element syncs like any other element, while the bytes go over a room-scoped HTTP endpoint the same Share link opens. An image is *saved* once its bytes are stored — which is the signal other Participants use to fetch them — *pending* until then, and *errored* when the store refused it (too large, or too many uploads), in which case nobody fetches it and everyone sees a placeholder.
