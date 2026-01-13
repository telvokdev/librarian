# Librarian

**The memory layer your AI should've had from day one.**

---

How many hours have you lost?

Context windows that forget everything. Compaction that deletes the crucial detail. The same mistake, repeated across sessions, because your AI partner has the memory of a goldfish.

You've tried everything. "Remember this." "Pretend you are an expert who never forgets." "Please, I'm begging you, don't lose this context again."

It doesn't work. It was never going to work.

**Librarian fixes this.**

---

## Features

- Semantic search with local AI embeddings (no API calls, fully offline)
- Import memories from other AI tools (Anthropic MCP Memory, Obsidian, Cursor, etc.)
- Smart ranking that balances recency and popularity
- Hit tracking to surface proven knowledge
- Works with any MCP client (Claude Code, Cursor, Windsurf, Claude Desktop)

---

## Install

### Claude Code

**Option 1: MCP Add (simplest)**
```bash
claude mcp add librarian -- npx @telvok/librarian-mcp
```

**Option 2: Plugin Marketplace**
```bash
/plugin marketplace add telvokdev/librarian
/plugin install librarian@librarian
```

### Any MCP Client

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

### Global Install (optional)

```bash
npm i -g @telvok/librarian-mcp
```

---

## API

### Tools

- **brief**
  - Search your library before diving in
  - Input:
    - `query` (string, optional): Natural language search query
    - `limit` (number, optional): Max results (default: 5)
  - Returns matching entries ranked by semantic similarity, recency, and hits
  - Falls back to keyword search if no query provided

- **record**
  - Capture knowledge worth keeping
  - Input:
    - `insight` (string, required): The knowledge to save
    - `intent` (string, optional): What you were trying to accomplish
    - `context` (string, optional): Topic or when this applies
    - `reasoning` (string, optional): Why this works
    - `example` (string, optional): Code snippet or illustration
    - `title` (string, optional): Entry title (auto-generated if not provided)
  - Automatically generates embeddings for semantic search

- **import_memories**
  - Import from other AI tools into Librarian
  - Input:
    - `format` (string, required): `"jsonl"` | `"markdown"` | `"cursor"` | `"json"` | `"sqlite"`
    - `path` (string, required): Path to file or folder
    - `source_name` (string, optional): Folder name for imported entries
  - Automatically indexes imported entries for semantic search

- **adopt**
  - Make imported knowledge yours (copy from packages/ to local/)
  - Input:
    - `path` (string, required): Path to entry (e.g., `"packages/stripe-patterns/webhooks"`)
    - `title` (string, optional): New title for adopted entry

- **mark_hit**
  - Mark an entry as helpful (increases ranking in future searches)
  - Input:
    - `path` (string, required): Path to the entry that helped
  - Fire and forget - entries with more hits bubble up

- **rebuild_index**
  - Regenerate semantic search embeddings for all entries
  - No input required
  - Use after upgrading from pre-v1.2.0 or if search seems broken

---

## Usage Examples

### Before Planning

```javascript
brief({ query: "stripe webhook handling" })
```

### After Learning Something

```javascript
record({
  insight: "Stripe retries webhooks but doesn't dedupe - always check idempotency key",
  context: "payments, webhooks",
  reasoning: "Their retry logic assumes failures, not slow responses"
})
```

### When an Entry Helps

```javascript
mark_hit({ path: "local/stripe-webhooks-need-idempotency.md" })
```

### Importing Existing Memories

```javascript
// From Anthropic MCP Memory
import_memories({ format: "jsonl", path: "~/.aim/memory.jsonl", source_name: "anthropic" })

// From Obsidian
import_memories({ format: "markdown", path: "~/Documents/Obsidian/Dev/", source_name: "obsidian" })

// From Cursor Memory Bank
import_memories({ format: "cursor", path: ".cursor-memory/", source_name: "cursor" })

// From JSON knowledge store
import_memories({ format: "json", path: "~/memories.json", source_name: "json-store" })

// From SQLite database (mcp-memory-service)
import_memories({ format: "sqlite", path: "~/memory.db", source_name: "sqlite-memory" })
```

---

## Supported Import Formats

| Format | Sources | File Type |
|--------|---------|-----------|
| `jsonl` | Anthropic MCP Memory, mcp-knowledge-graph | `.jsonl` files with entities/relations |
| `markdown` | Obsidian, Basic Memory MCP, any notes | `.md` files with optional YAML frontmatter |
| `cursor` | Cursor Memory Bank | `.cursor-memory/` folder |
| `json` | Simple memory servers, knowledge stores | `.json` arrays or objects |
| `sqlite` | mcp-memory-service, SQLite-vec | `.db`, `.sqlite` databases |

---

## Semantic Search

Not keyword matching. Understanding.

```
# You saved: "Stripe webhooks need idempotency checks"
# You search: "handling duplicate payment events"
# It finds it.
```

**How it works:**
- Uses local `all-MiniLM-L6-v2` model (384-dimension embeddings)
- First run downloads ~30MB model (cached in `.librarian/models/`)
- No API calls - your data stays on your machine

---

## Smart Ranking

`brief()` ranks results using a blended score:

| Factor | Weight | Description |
|--------|--------|-------------|
| Semantic similarity | Primary | How closely the query matches the content |
| Recency | 60% | Fresh entries surface (decays over 30 days) |
| Hits | 40% | Proven entries bubble up |

This balances discovery of new knowledge with survival of the useful.

---

## Library Structure

```
.librarian/
├── local/           # Your knowledge (recorded + imported)
│   ├── stripe-webhooks.md
│   └── anthropic/   # Imported from other tools
├── packages/        # Marketplace content (others' knowledge)
├── archived/        # Stale but still searchable
├── index.json       # Semantic embeddings
└── models/          # Cached embedding model
```

---

## What To Record

**Yes:**
- The solution that took hours to find
- The gotcha that'll bite again
- Why you chose X over Y
- What you were actually trying to accomplish

**No:**
- Generic documentation (search engines exist)
- Temporary hacks (they'll mislead you later)

---

## The Pitch

Other AI memory tools are silos. They write to their own format, locked in their own ecosystem.

**Librarian reads everything.**

Import from anywhere. Search semantically. One library to rule them all.

**Your AI finally remembers.**

---

## License

MIT
