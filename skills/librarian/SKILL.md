---
name: librarian
description: Use this skill when capturing learnings from our work together, or when starting work that might benefit from past knowledge. Triggers on: memory, remember, what did we learn, library, save this, before planning, decisions.
version: 1.5.2
---

# Librarian

We build a library together. Every insight worth remembering goes here.

## Tools

- `brief(query)` - Search our library with semantic search. Use before planning or when something feels familiar.
- `record(insight, ...)` - Save knowledge immediately when we learn something. One insight per call.
- `adopt(path)` - Copy imported entry to local (make it ours)
- `mark_hit(path)` - Track when an entry helps. Higher hits = higher ranking.
- `import_memories(format, path)` - Import from other AI tools (jsonl, markdown, cursor, json, sqlite)
- `rebuild_index()` - Rebuild semantic search index for legacy entries

## Workflow

### Before Thinking
Call `brief({ query: "relevant topic" })` to check what we already know. Also use when an issue comes up again or feels like something we solved before.

### During Work
Call `record()` immediately when we:
- Solve a problem (before moving to the next thing)
- Make a decision (capture the reasoning NOW)
- Hit a gotcha or mistake (it WILL come up again)
- Learn something non-obvious (context dies fast)

Don't wait. Don't batch. One insight = one record call. Multiple recordings in one response is fine.

### After Brief Helps
Call `mark_hit({ path: "..." })` when an entry from brief actually helped. This makes it rank higher next time.

## What to Record

**Yes:**
- Hard-won solutions (the "aha" moments)
- Gotchas, mistakes, and workarounds
- Patterns that worked
- Decisions and their reasoning
- Non-obvious learnings

**No:**
- Generic docs (search exists)
- Temporary fixes
- Things likely to change next week

## Entry Format

```markdown
# Title

Brief description of what this captures.

## Context
When/why this matters.

## The Insight
The actual knowledge.

## Example (optional)
Code or concrete illustration.
```

## Quality Bar

**"I wish we knew this yesterday"**

Good: "Stripe retries webhooks but doesn't dedupe - always check idempotency key"

Not for Librarian: "Redis is a key-value store." (Just a fact, not wisdom.)

## Smart Ranking

Entries are ranked by:
- 60% semantic similarity to your query
- 25% recency (newer = higher)
- 15% hit count (more helpful = higher)

## Examples

### Searching before planning
```
brief({ query: "stripe webhooks" })
```

### Recording immediately
```
record({ insight: "Clock skew between services - add 30s buffer to token validation" })
```

### Rich recording
```
record({
  intent: "Setting up GitHub org for Telvok",
  insight: "GitHub org names are first-come-first-served regardless of domain ownership",
  context: "GitHub, npm, branding",
  reasoning: "We owned telvok.com but someone squatted telvok org years ago",
  example: "Had to use telvokdev instead of telvok"
})
```

### Marking what helped
```
mark_hit({ path: "local/stripe-webhooks-need-idempotency.md" })
```

### Importing from other tools
```
import_memories({ format: "jsonl", path: "~/.aim/memory.jsonl", source_name: "anthropic" })
import_memories({ format: "sqlite", path: "~/memory.db", source_name: "mcp-memory" })
```

## File Structure

```
.librarian/
├── local/        # Our entries (indexed for semantic search)
├── packages/     # Downloaded packages
└── index.json    # Semantic embeddings
```
