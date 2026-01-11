---
name: librarian
description: Use this skill when capturing learnings from our work together, or when starting work that might benefit from past knowledge. Triggers on: memory, remember, what did we learn, library, save this, before planning, decisions.
version: 1.0.0
---

# Librarian

We build a library together. Every insight worth remembering goes here.

## Tools

- `brief(topic)` - Search our library for relevant entries
- `record(topics, content)` - Save to local library
- `adopt(entry)` - Copy imported entry to local (make it ours)

## Workflow

### Starting a Task
1. Call `brief(topic)` to check what we already know
2. Use what's relevant, ignore what's not

### During Work
- Notice patterns, gotchas, solutions worth remembering
- Don't interrupt flow - mental note for later

### Finishing Up
- Call `record()` for insights worth keeping
- If an imported entry was particularly useful, `adopt()` it to local

## What to Record

**Yes:**
- Hard-won solutions (the "aha" moments)
- Gotchas and workarounds
- Patterns that worked
- Decisions and why

**No:**
- Generic docs (we can search those)
- Temporary fixes
- Things likely to change

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

## File Structure

```
.librarian/
├── local/            # Our entries
├── imported/         # Downloaded packages
└── archived/         # Stale entries (still searchable)
```

## Quality Bar

**The Senior Dev Test:** Would a senior dev say this to a new hire on their first day?

Good: "When you're working on webhooks, always add idempotency. We learned that the hard way."

Not for Librarian: "Redis is a key-value store." (Just a fact, not wisdom.)

## Examples

### Recording a learning
```
record({
  topics: ["webhooks", "stripe"],
  content: "We added Redis SETNX for idempotency after the December incident. Event IDs as keys, 24h TTL. No more duplicate charges."
})
```

### Searching before planning
```
brief({ topic: "deployment" })
```

### Adopting useful knowledge
```
adopt({ entry: "stripe-patterns/webhook-basics" })
```

## Coming Soon

**Telvok Marketplace** - Browse, buy, and sell libraries at telvok.com
