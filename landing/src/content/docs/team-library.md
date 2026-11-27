---
title: Team library
description: One set of reusable shapes and icons for the whole team.
---

The Team library is the Library panel in the editor. It appears in every
drawing, Private or Team. Every member sees and edits the same items.

- Items are saved on your server.
- When a member adds or removes an item, it updates live in the open editors of
  the rest of the team.
- Libraries from [libraries.excalidraw.com](https://libraries.excalidraw.com)
  install into it.
- Guests on a share link cannot see or change it.

## Import an item with images

Excalidraw's **Add to library** action does not accept images. To reuse a
drawing with images through the [MCP server](/docs/mcp/), drop an
`.excalidrawlib` file with embedded images onto the canvas, or choose **Open**
from the Library panel's three-dot menu.

Start with a version 2 `.excalidrawlib` export. Add the elements from your
`.excalidraw` drawing to a `libraryItems` entry, and put the drawing's
`files` map **inside that entry**, alongside `elements`. Keep the matching
`files[fileId]` entry for each image, with its `id`, `mimeType`, `dataURL`,
and `created` fields. A `files` map at the top level of the library file
does not attach images to the items.

Use `list_library_items` to find the item and `edit_drawing` to propose
inserting it. The proposal's preview shows the images. The drawing gets its
own copy when you apply the proposal.

## Limits

- One item can be up to 1 MB, including any embedded images.
- The whole library can be up to 10 MB, including embedded images. When it is
  full, the editor refuses new items and says why. Remove items to make room.
- One member can save up to 60 library changes a minute.
