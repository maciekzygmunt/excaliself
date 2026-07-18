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
The single way a Drawing is created: a command-style dialog where the user types a name and confirms. Every Drawing is deliberately named at birth; the app never creates a Drawing on the user's behalf.

### Preview
A non-interactive visual rendering of a Drawing's scene, shown on Home so drawings are recognizable by shape rather than name.
