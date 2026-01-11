# Librarian

Knowledge capture for Claude Code and MCP clients.

## What This Is

Librarian is a memory layer for AI agents. It captures what you learn together—patterns, decisions, gotchas—before context compacts and reasoning disappears.

**Three tools:**
- `brief(topic)` - Query the library before planning
- `record(topics, content)` - Save learnings
- `adopt(entry)` - Copy imported entries to local

## Install

### Claude Code

```bash
# Clone to your project
git clone https://github.com/Telvok/librarian.git .librarian-plugin

# Build
cd .librarian-plugin && npm run build && cd ..

# Add to .mcp.json
{
  "mcpServers": {
    "librarian": {
      "command": "node",
      "args": [".librarian-plugin/mcp/dist/server.js"]
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP settings:

```json
{
  "mcpServers": {
    "librarian": {
      "command": "node",
      "args": ["/path/to/librarian/mcp/dist/server.js"]
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
      "command": "node",
      "args": ["/path/to/librarian/mcp/dist/server.js"]
    }
  }
}
```

## Usage

### Before Planning
```
brief({ topic: "deployment" })
```

### After Learning Something
```
record({
  topics: ["webhooks", "stripe"],
  content: "Always add idempotency with Redis SETNX. Event IDs as keys, 24h TTL."
})
```

### Adopting Imported Knowledge
```
adopt({ entry: "package-name/entry-name" })
```

## Library Structure

```
.librarian/
├── local/           # Your entries
├── imported/        # Downloaded packages
└── archived/        # Stale entries (still searchable)
```

## The Quality Bar

**The Senior Dev Test:** Would a senior dev say this to a new hire on their first day?

✅ "When working on webhooks, always add idempotency. We learned that the hard way."

❌ "Redis is a key-value store." (Just a fact, not wisdom.)

## Hooks (Optional)

Add to `.claude/settings.json` for reminders:

```json
{
  "hooks": {
    "Stop": [{
      "matcher": "*",
      "hooks": [{"type": "command", "command": "echo 'Anything worth remembering? Call record() if so.'"}]
    }],
    "UserPromptSubmit": [{
      "matcher": "*", 
      "hooks": [{"type": "command", "command": "echo 'Check brief() first if planning.'"}]
    }]
  }
}
```

## Coming Soon

**Telvok Marketplace** - Browse, buy, and sell libraries at telvok.com

## License

MIT
