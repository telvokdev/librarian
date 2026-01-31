---
name: sync-library
description: Sync all purchased books and rebuild search index
---

# Sync Library

Full refresh — sync all purchased books and rebuild the search index.

## Action

1. Call `sync()` to check for and download updates to all owned books.
2. Call `rebuild_index()` to regenerate semantic search embeddings.
3. Report what was synced and the index status.
