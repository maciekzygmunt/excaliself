---
title: Organize and find
description: Folders, stars, copies, offline drawings, selecting many drawings, search, the command palette, export, and the trash.
---

## Folders and stars

Nest folders and drag drawings between them in the sidebar. Starred drawings
appear in the sidebar. **Home** shows your recent drawings, ordered by when they
were last edited. **All drawings** shows them all. Drawing and folder names
can be up to 1,000 characters.

Each drawing card has a **⋯** menu, like each row in the sidebar. Use it to
**Star** or **Unstar**, **Rename**, **Duplicate**, **Export .excalidraw**,
**Move to Team**, or **Move to trash**.

**Duplicate** makes a copy of the drawing, with its images, in the same folder
and space. The copy is named like the drawing, with " (copy)" at the end. It
has no stars and no share link.

## Pick up where you left off

When you reopen a drawing, Excaliself restores your last canvas position and
zoom, even if you only panned or zoomed. Each browser remembers its own view,
also on shared drawings and share links.

## Offline drawings

Offline drawings are in beta and off by default. To turn them on, open
**Settings** and choose **Turn on** under **Offline drawings (beta)**. The
setting applies to this browser only.

When they are on, each Private drawing you open is also kept in this browser.
When your instance can't be reached, opening Excaliself shows **Offline
drawings** instead. There you can open the drawings this browser keeps, and make new
ones. You can also choose **Offline drawings** from your account menu.

Edits made offline stay in this browser, also after a reload or a browser
restart. If a save fails while you draw online, the drawing shows **Saved on
this device · waiting to sync**. Excaliself sends the edits when the instance
can be reached again, while Excaliself is open. A drawing open on the
**Offline drawings** page is sent when you close it or choose **Back to
Excaliself**. Sign in again if your session has ended. Drawings made offline
go to your Private space.

If the drawing changed somewhere else while you were offline, Excaliself does
not overwrite it. It saves your version as a new drawing with " (offline
copy)" at the end of its name. This also happens if the drawing was moved to
Team, shared, or moved to the trash.

To turn offline drawings off, choose **Turn off** in the same place. This
sends the edits that wait in this browser, and then deletes the offline
copies. If the edits can't be sent, offline drawings stay on.

Offline drawings need HTTPS or `localhost`. Team drawings and drawings with a
share link are not kept offline. Clearing this site's data in the browser
deletes the offline copies, also edits that are not sent yet. Signing out
hides them until you sign in again in the same browser.

## Select many drawings

On **Home**, **All drawings**, and folder pages, point to a drawing and click
the box in its top-left corner. On a touch screen, the box is always there.
When one drawing is selected, a click on any card selects it instead of
opening it. Shift-click selects every drawing between two cards, and
**Select all** selects every drawing on the page. Press
<kbd>Esc</kbd> to clear the selection.

The bar under the grid can do these actions on all selected drawings:

- **Star** or **Unstar**.
- **Move to folder**: a folder in the same space. This action is only there
  when all selected drawings are in one space.
- **Move to Team**: only for Private drawings. They go to the top of Team.
- **Export**: one drawing downloads as an `.excalidraw` file. Two or more
  download as a `.zip` of `.excalidraw` files. Images are in the files.
- **Move to trash**, with one **Undo** for all of them.

If one drawing can't change, none of them change.

## Search

Search finds drawings by title and by the text inside them. It is in the toolbar
on **All drawings** and on folder pages, and in the command palette. In a
drawing with a lot of text, search reads only the first 10,000 characters.

## Command palette

Press <kbd>⌘K</kbd> or <kbd>Ctrl K</kbd> to find a drawing, go to a page, or
run an action such as **New drawing**, **Rename**, or **Move to folder**.

## Export

To save a drawing to your computer without opening it, open its **⋯** menu on
a card or in the sidebar and choose **Export .excalidraw**. The file includes
the drawing's images. Open it in any Excalidraw, or
[import](/docs/import/#from-files) it again.

## Trash

**Move to trash** keeps a drawing or folder for 30 days. Open **Trash** to
restore it or to delete it forever. After 30 days, the app deletes it
automatically.
