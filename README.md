# Librarian

[![npm version](https://img.shields.io/npm/v/@telvok/librarian-mcp.svg)](https://www.npmjs.com/package/@telvok/librarian-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Downloads](https://img.shields.io/npm/dm/@telvok/librarian-mcp.svg)](https://www.npmjs.com/package/@telvok/librarian-mcp)

A knowledge management MCP server for AI coding assistants. Capture insights, search with semantic understanding, and access a library of developer knowledge.

## Installation

<details>
<summary>Claude Code (Recommended)</summary>

#### Plugin (full experience)

Includes MCP tools, slash commands, and hooks.

```
/plugin marketplace add telvokdev/librarian
/plugin install librarian@librarian
```

#### MCP only

```bash
claude mcp add librarian -- npx @telvok/librarian-mcp
```

</details>

<details>
<summary>Cursor</summary>

Add to `.cursor/mcp.json`:

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

</details>

<details>
<summary>Windsurf</summary>

Add to `~/.codeium/windsurf/mcp_config.json`:

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

</details>

<details>
<summary>Any MCP Client</summary>

Add to your MCP config:

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

Or install globally:

```bash
npm install -g @telvok/librarian-mcp
```

</details>

## Quick Start

```javascript
// Search before making decisions
brief({ query: "stripe webhook handling" })

// Capture what you learned
record({
  insight: "Stripe retries webhooks but doesn't dedupe - always check idempotency key",
  context: "payments, webhooks"
})

// Mark helpful entries to boost their ranking
mark_hit({ path: "local/stripe-webhooks-need-idempotency.md" })

// Browse the library
library_search({ query: "react patterns" })
```

## API Reference

### Local Knowledge

| Tool | Purpose |
|------|---------|
| `brief(query?, limit?)` | Semantic search across your library |
| `record(insight, ...)` | Capture knowledge worth keeping |
| `adopt(path, title?)` | Copy imported entry to local library |
| `mark_hit(path)` | Mark an entry as helpful (increases ranking) |
| `import_memories(format, path)` | Import from other AI tools |
| `rebuild_index(force?)` | Rebuild semantic search embeddings |
| `delete(path?, query?, confirm?)` | Delete entries from local library |

### Library

Free books available now. Paid books and seller payouts coming soon. Browse at [telvok.com](https://telvok.com).

| Tool | Purpose |
|------|---------|
| `library_search(query, filters?)` | Search Telvok library |
| `library_download(slug)` | Download a free book locally |
| `library_publish(name, attestation, ...)` | Publish entries as a book |
| `my_books(filter?)` | View published and downloaded books |
| `sync(slug?, force?)` | Check for updates to owned books |
| `rate_book(slug, rating, ...)` | Rate a book (1-5 stars) |
| `seller_analytics()` | View download stats for your books |

### Bounties (Coming Soon)

| Tool | Purpose |
|------|---------|
| `bounty_create(title, ...)` | Post a knowledge request |
| `bounty_list(query?, tags?, status?)` | Browse available bounties |
| `bounty_claim(bounty_id)` | Claim a bounty to fulfill |
| `bounty_submit(bounty_id, book_slug)` | Submit fulfillment |
| `my_bounties(role?)` | View your bounties |

### Account

| Tool | Purpose |
|------|---------|
| `auth(action)` | Login, logout, status, complete |
| `help(topic?)` | Get help on any tool |
| `feedback(message, type?)` | Send feedback |

## How Search Works

Librarian uses local AI embeddings for semantic search:

```
You saved:   "Stripe webhooks need idempotency checks"
You search:  "handling duplicate payment events"
→ It finds it.
```

- `all-MiniLM-L6-v2` model (384-dim embeddings)
- ~30MB download on first run, cached locally
- No API calls — fully offline

Results ranked by semantic similarity, recency (60%), and hit count (40%).

## Import Formats

| Format | Sources |
|--------|---------|
| `jsonl` | Anthropic MCP Memory, mcp-knowledge-graph |
| `markdown` | Obsidian, Basic Memory MCP |
| `cursor` | Cursor Memory Bank |
| `json` | Simple memory servers |
| `sqlite` | mcp-memory-service, SQLite-vec |

## Authentication

1. `auth({ action: "login" })` — returns code + URL
2. Visit `telvok.com/device`, enter the code
3. `auth({ action: "complete" })` — saves API key locally

Keys stored in `.librarian/.auth`, expire after 90 days.

## Library Structure

```
.librarian/
├── local/        # Your entries
├── imported/     # Downloaded books
├── packages/     # Purchased content
├── archived/     # Stale but searchable
├── index.json    # Semantic embeddings
├── models/       # Cached embedding model
└── .auth         # API key (git-ignored)
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit changes (`git commit -m 'Add my feature'`)
4. Push (`git push origin feature/my-feature`)
5. Open a Pull Request

## License

MIT - [Telvok](https://github.com/telvokdev/librarian)
