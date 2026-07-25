# Ubiquitous Language

## Terms

### Home
The state of the canvas area when no drawing is open. Shown inside the normal app shell (sidebar visible) — not a standalone landing page. Presents recent Drawings (with Previews) and the create action; doubles as the empty state when the user has no Drawings yet. Also the landing spot after actions that orphan the user, such as deleting the currently open Drawing or following a link to a Drawing that no longer exists.

### Recent
Drawings ordered by when they were last edited (not created, not opened). Editing a Drawing is the only thing that makes it "recent".

### Drawing
A single Excalidraw document owned by a user, identified by id, living in the folder tree shown in the sidebar.

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

### Share link
The one live edit link a Drawing can have (`/share/<token>`), minted and managed by the owner from the Share dialog. "Shared" is derived — a Drawing is shared iff its link exists; stopping sharing deletes it, regenerating replaces the token (old URL dies). Carries an Audience: `members` (any signed-in member of this instance, the default) or `anyone` (no account needed). A link whose token, Audience, or Drawing no longer checks out is dead — every dead link looks identical, revealing nothing about whether the Drawing exists.

### Participant
One socket connected to a Room, as everyone else in it sees it: a display name, an assigned cursor color, and whether it belongs to a member or a guest. Identified by a Connection id, never by a userId — a member's account never crosses the wire to a guest. A member's name comes from their session and cannot be set from the client; a guest's is a pseudonym it generates and keeps in its own browser.

### Connection id
The random id a socket is given when it joins a Room, and the only handle other Participants have on it. Ephemeral by design (spec §4.4): reconnecting produces a new one, so it is not an identity that can be tracked or blocked — abuse limits key on IP instead.

### Following
A one-way arrangement between two Participants in a Room: the follower's canvas rides along with the followed Participant's viewport, marked by a ring in that Participant's color and a chip naming them. Started by clicking their avatar, ended by clicking the chip, their avatar, panning or zooming, or by them leaving. Nobody can be made to follow, and being followed changes nothing about what the followed Participant can do — only that their viewport is relayed to whoever is watching.
