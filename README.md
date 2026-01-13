# Librarian

Knowledge capture for Claude Code and MCP clients.

## What This Is

Your AI partner remembers nothing between sessions. Every insight, every hard-won solution, every "aha" moment—gone. Librarian fixes that.

We build a library together. Not documentation—the other stuff. The gotcha that burned an hour. The pattern that finally clicked. Why we chose X over Y.

**Four tools:**
- `brief(query)` - Check what we already know before diving in
- `record(insight, ...)` - Capture knowledge worth keeping. Quality bar: "I wish we knew this yesterday"
- `mark_hit(path)` - Mark an entry as helpful. Entries with more hits bubble up in future queries
- `adopt(path)` - Make imported knowledge ours

## Install

### Claude Code (Plugin - Recommended)

```bash
/plugin marketplace add telvokdev/librarian
/plugin install librarian@telvokdev-librarian
```

This gives you the MCP tools + hooks that prompt Claude to use them.

### Claude Code (MCP Only)

```bash
claude mcp add librarian -- npx @telvok/librarian-mcp
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

### When an Entry Helps
```
mark_hit({ path: "local/stripe-webhooks-need-idempotency.md" })
```
Fire and forget. Entries with more hits rank higher in future `brief()` results.

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

## Semantic Search

**New in v1.2.0:** Librarian uses local AI embeddings for semantic search. Query with natural language and find entries even when keywords don't match.

```
# Entry saved as: "Stripe webhooks need idempotency checks"
# Query finds it with:
brief({ query: "how to handle duplicate payment events" })
```

**How it works:**
- On `record()` → generates embeddings using local `all-MiniLM-L6-v2` model
- On `brief(query)` → embeds query → finds semantically similar entries
- Falls back to keyword search if embeddings unavailable

**First run:** Downloads ~30MB model (cached in `.librarian/models/`)

**Fully offline:** No API calls, your data stays local.

## Smart Ranking

`brief()` ranks entries using a blended score:
- **60% recency** - New entries surface (decays over 30 days)
- **40% hits** - Proven entries bubble up

This balances discovery of fresh knowledge with survival of the useful.

## License

MIT
