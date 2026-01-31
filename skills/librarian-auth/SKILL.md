---
name: librarian-auth
description: Use this skill for connecting to Telvok, managing auth, or when marketplace tools return auth errors. Triggers on: login, connect, authenticate, telvok account, api key.
version: 2.0.0
---

# Telvok Authentication

Connect your Telvok account to access the marketplace, bounties, and publishing.

## Tool

`auth({ action })` - Manage your Telvok connection

### Actions

| Action | Description |
|--------|-------------|
| `login` | Start device code flow — returns a code and URL |
| `complete` | Finish login after browser authorization |
| `status` | Check if currently authenticated |
| `logout` | Remove stored credentials |

## Login Flow

1. `auth({ action: "login" })` — Returns a code (e.g., "FBAM-57AJ") and URL
2. User visits telvok.com/device in their browser
3. User enters the code and authorizes
4. `auth({ action: "complete" })` — Saves API key locally

Credentials are stored in `.librarian/.auth` as JSON:
```json
{
  "api_key": "tvk_...",
  "user_email": "you@example.com",
  "user_id": "uuid",
  "created_at": "...",
  "expires_at": "..."
}
```

## When Auth is Required

These tools require authentication:
- `library_buy()` - Purchasing books
- `library_publish()` - Publishing books
- `bounty_create()` / `bounty_claim()` / `bounty_submit()` - Bounties
- `my_books()` - Viewing your library
- `seller_analytics()` - Sales data
- `rate_book()` - Rating books
- `sync()` - Syncing purchased content
- `my_bounties()` - Your bounties
- `feedback()` - Sending feedback

## Troubleshooting

**"Authentication required" error:**
Run `auth({ action: "status" })` to check. If not connected, run `auth({ action: "login" })`.

**Expired key:**
API keys expire after 90 days. Run `auth({ action: "login" })` to get a new one.

**Wrong account:**
Run `auth({ action: "logout" })` then `auth({ action: "login" })` with the correct account.

## See Also

- **librarian-marketplace** - Buy, sell, and search books
- **librarian-bounties** - Knowledge bounty system
- **librarian** - Local knowledge capture
