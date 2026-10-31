---
title: Connect an AI client
description: Let Claude Code, Claude Desktop, and other MCP clients find, read, and create drawings.
---

Excaliself has an [MCP](https://modelcontextprotocol.io) server at `/api/mcp`.
Your AI client brings the model, so the instance needs no LLM API key.

1. In Excaliself, open **Settings**, then **MCP**, and click
   **New token**. Copy the token: you see it only once.
2. Add the server to your client, with your instance's URL and the token.

## Claude Code

The token dialog shows this command filled in:

```bash
claude mcp add --transport http excaliself https://draw.example.com/api/mcp \
  --header "Authorization: Bearer exs_..."
```

## Claude Desktop

Claude Desktop cannot send a token to a remote server itself, so it connects
through [`mcp-remote`](https://www.npmjs.com/package/mcp-remote), which needs
Node. Open **Settings**, then **Developer**, then **Edit Config**, add this to
`claude_desktop_config.json`, and restart Claude Desktop:

```json
{
  "mcpServers": {
    "excaliself": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://draw.example.com/api/mcp",
        "--header",
        "Authorization:${AUTH_HEADER}"
      ],
      "env": { "AUTH_HEADER": "Bearer exs_..." }
    }
  }
}
```

## Other clients

For clients that use Streamable HTTP, the URL is
`https://<your instance>/api/mcp`, with the header
`Authorization: Bearer <token>`.

## Tools

- `list_drawings`, `search_drawings`, and `list_folders` find drawings, with
  their space and folder.
- `read_drawing` describes a drawing: its shapes, text, and what the arrows
  connect. It does not send the raw Excalidraw JSON.
- `create_drawing` makes a new drawing in your private space or in Team,
  optionally in a folder, from simple shapes and arrows or a Mermaid flowchart.

## Access

A token acts as you: it sees what you see. It can create drawings, but it
cannot change or delete drawings that exist. Revoke a token under Settings at
any time. When an admin deletes a member, that member's tokens stop working.
