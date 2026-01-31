---
name: librarian-marketplace
description: Use this skill for buying, selling, or searching books on the Telvok marketplace. Triggers on: marketplace, buy, sell, publish, search books, library store, browse, catalog.
version: 2.0.0
---

# Telvok Marketplace

Buy and sell knowledge books on the Telvok marketplace.

## Tools

- `library_search(query, filters?)` - Search marketplace for books
- `library_buy(slug)` - Purchase or claim a book
- `library_download(slug)` - Download a free (open) book locally
- `library_publish(name, pricing, attestation, ...)` - Publish your entries as a book
- `my_books(filter?)` - View your published and purchased books
- `sync(slug?, force?)` - Check for and receive updates to owned books
- `rate_book(slug, rating, title?, comment?)` - Rate a purchased book (1-5 stars)
- `seller_analytics()` - View your sales, reviews, and download stats
- `unsubscribe(slug)` - Cancel a subscription to a book

## Pricing Tiers

| Tier | Price | Access | Updates |
|------|-------|--------|---------|
| **Open** | Free | Downloads locally | Manual re-download |
| **One-time** | $X | Cloud API only | Seller decides |
| **Subscription** | $X/mo | Cloud API only | Always latest |

Platform fee: 20% on paid transactions.

## Buying Workflow

1. `library_search({ query: "react patterns" })` - Find books
2. `library_buy({ slug: "react-best-practices" })` - Purchase (returns checkout URL for paid)
3. Complete payment in browser (if paid)
4. `sync()` - Download content
5. `rate_book({ slug: "react-best-practices", rating: 5 })` - Rate the book

## Selling Workflow

1. Build knowledge with `record()` over time
2. `auth({ action: "login" })` - Connect your Telvok account
3. Set up Stripe Connect (required for paid books) at telvok.com
4. `library_publish({ name: "My Patterns", pricing: { type: "one_time", price_cents: 999 }, attestation: { original_work: true, terms_accepted: true } })`
5. `seller_analytics()` - Track performance

## Search Filters

```
library_search({
  query: "auth patterns",
  filters: {
    pricing: "open",        // "open" | "one_time" | "subscription"
    tags: ["auth", "jwt"],  // Filter by tags
    min_rating: 4           // 1-5
  }
})
```

## See Also

- **librarian** - Local knowledge capture (brief, record, mark_hit)
- **librarian-bounties** - Knowledge bounty system
- **librarian-auth** - Authentication and account setup
