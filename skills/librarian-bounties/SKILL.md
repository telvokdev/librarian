---
name: librarian-bounties
description: Use this skill for knowledge bounties — creating, claiming, or fulfilling bounty requests. Triggers on: bounty, reward, knowledge request, fulfill, claim bounty.
version: 2.0.0
---

# Knowledge Bounties

Create and fulfill knowledge bounties on Telvok. Post what you need, reward who delivers.

## Tools

- `bounty_create(title, amount_cents, description?, tags?, expires_days?)` - Post a knowledge request
- `bounty_list(query?, tags?, status?, limit?)` - Browse available bounties
- `bounty_claim(bounty_id)` - Claim a bounty to fulfill
- `bounty_submit(bounty_id, book_slug)` - Submit your published book as fulfillment
- `my_bounties(role?)` - View your created and claimed bounties

## Bounty Lifecycle

```
Creator: bounty_create() → Pay via Stripe → Bounty goes live
                                                    ↓
Claimer: bounty_list() → bounty_claim() → library_publish() → bounty_submit()
                                                    ↓
Creator: Review submission → Approve (payment released) or Reject (with reason)
                                                    ↓
                              If no response in 7 days → Auto-approved
```

## Creating a Bounty

```
bounty_create({
  title: "Stripe webhook patterns",
  amount_cents: 1000,           // $10 minimum $5
  description: "Need idempotency and retry handling examples",
  tags: ["stripe", "webhooks"],
  expires_days: 30              // Default: 30
})
```

Returns a Stripe checkout URL. Bounty becomes visible after payment.

Platform fee: 20% (claimer receives 80%).

## Fulfilling a Bounty

1. `bounty_list({ query: "stripe" })` - Find bounties you can fulfill
2. `bounty_claim({ bounty_id: "abc123..." })` - Claim it (locks out others)
3. Create knowledge with `record()`, then `library_publish()` as a book
4. `bounty_submit({ bounty_id: "abc123...", book_slug: "my-stripe-patterns" })`
5. Wait for creator review (7 day deadline, auto-approved if no response)

## Checking Your Bounties

```
my_bounties()                        // All your bounties
my_bounties({ role: "creator" })     // Bounties you posted
my_bounties({ role: "claimer" })     // Bounties you're fulfilling
```

## Rejection and Disputes

- Creators must provide a reason (10+ chars) when rejecting
- Rejected bounties are refunded to the creator
- Sellers can dispute unfair rejections

## Notes

- Tags are case-sensitive ("stripe" is not "STRIPE")
- Cannot claim your own bounty
- Must be authenticated (`auth({ action: "login" })`)

## See Also

- **librarian-marketplace** - Buy and sell books
- **librarian-auth** - Authentication setup
- **librarian** - Local knowledge capture
