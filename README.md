# Librarian

Knowledge capture for Claude Code and MCP clients.

## What This Is

Librarian is a memory layer for AI agents. It captures what you learn together—patterns, decisions, gotchas—before context compacts and reasoning disappears.

**Three tools:**
- `brief(query)` - Check what we know before planning/deciding
- `record(insight, ...)` - Capture knowledge worth keeping
- `adopt(path)` - Take ownership of imported entries

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

## Library Structure

```
.librarian/
├── local/           # Your entries
├── imported/        # Downloaded packages
└── archived/        # Stale entries (still searchable)
```

## The Quality Bar

**"I wish we knew this yesterday"**

Good entries:
- "Stripe retries webhooks but doesn't dedupe - always check idempotency key"
- "Clock skew between services - add 30s buffer to token validation"

Not worth recording:
- Generic docs (you can search those)
- Temporary hacks
- Stuff that'll change next week

## Coming Soon

**Telvok Marketplace** - Browse, buy, and sell libraries at telvok.com

## License

MIT
