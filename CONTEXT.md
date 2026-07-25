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
