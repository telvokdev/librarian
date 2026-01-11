# Librarian

Knowledge capture for Claude Code and MCP clients.

## What This Is

Your AI partner remembers nothing between sessions. Every insight, every hard-won solution, every "aha" moment—gone. Librarian fixes that.

We build a library together. Not documentation—the other stuff. The gotcha that burned an hour. The pattern that finally clicked. Why we chose X over Y.

**Three tools:**
- `brief(query)` - Check what we already know before diving in
- `record(insight, ...)` - Capture knowledge worth keeping. Quality bar: "I wish we knew this yesterday"
- `adopt(path)` - Make imported knowledge ours

## Install

### Claude Code (Plugin - Recommended)

```bash
/plugin marketplace add telvokdev/librarian
/plugin install librarian@librarian
```

This gives you the MCP tools + hooks that prompt Claude to use them.

### Claude Code (MCP Only)

```bash
/mcp add @telvok/librarian-mcp
```

Or add to your `.mcp.json`:

```json
{
  "mcpServers": {
    "librarian": {
      "command": "npx",
      "args": ["@telvok/librarian-mcp"]
    }
  }
}
```

### Cursor / Windsurf / Other MCP Clients

Add to your MCP settings:

```json
{
  "mcpServers": {
    "librarian": {
      "command": "npx",
      "args": ["@telvok/librarian-mcp"]
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "librarian": {
      "command": "npx",
      "args": ["@telvok/librarian-mcp"]
    }
  }
}
```

## Usage

### Before Planning
```
brief({ query: "stripe webhooks" })
```

### After Learning Something
```
record({
  insight: "Stripe retries webhooks but doesn't dedupe - always check idempotency key",
  context: "payments",
  reasoning: "Their retry logic assumes failures, not slow responses"
})
```

### Adopting Imported Knowledge
```
adopt({ path: "imported/package-name/entry-name" })
```

## What to Record

✅ The solution that took 2 hours to find
✅ The gotcha that'll bite again
✅ Why we chose X over Y
✅ What we were trying to accomplish

❌ Generic docs (search exists)
❌ Temporary hacks

## Library Structure

```
.librarian/
├── local/           # Your entries
├── imported/        # Downloaded packages
└── archived/        # Stale entries (still searchable)
```

## License

MIT
