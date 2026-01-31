---
name: search-marketplace
description: Search the Telvok marketplace for books
---

# Search Marketplace

Search for books on the Telvok marketplace.

## Action

1. Ask the user what they're looking for (or use their query if provided as an argument).
2. Call `library_search({ query: "<user's query>" })`.
3. Display results: title, description, pricing, rating, tags.
4. Offer to buy or download any result.
